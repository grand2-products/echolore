import { MarketingPermission } from "@echolore/shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { MarketingChangeRequest } from "../../db/schema.js";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import { auditAction } from "../../lib/audit.js";
import type { AppEnv } from "../../lib/auth.js";
import {
  getRequestMarketingPermissions,
  hasMarketingPermission,
} from "../../policies/marketing-policy.js";
import {
  getAssetById,
  listAssets,
} from "../../repositories/marketing/marketing-asset-repository.js";
import {
  applyChangeUpdate,
  createChange,
  getChangeById,
  listChangeEvents,
  listChanges,
} from "../../repositories/marketing/marketing-change-repository.js";
import {
  getUserNameMap,
  pageExists,
} from "../../repositories/marketing/marketing-knowledge-repository.js";
import {
  planChangeTransition,
  requiresPostReview,
} from "../../services/marketing/marketing-change-workflow.js";
import {
  changeUserIds,
  toChangeDto,
  toChangeEventDto,
} from "../../services/marketing/marketing-dto.js";
import { changeTransitionSchema, listChangesQuerySchema, upsertChangeSchema } from "./schemas.js";

export const marketingChangeRoutes = new Hono<AppEnv>();

const EDITABLE_STATUSES = new Set(["open", "rejected"]);

async function assetNameMap() {
  return new Map((await listAssets()).map((a) => [a.id, a.name]));
}

async function toDtos(changes: MarketingChangeRequest[]) {
  const [names, assets] = await Promise.all([
    getUserNameMap(changes.flatMap(changeUserIds)),
    assetNameMap(),
  ]);
  return changes.map((ch) => toChangeDto(ch, names, assets));
}

async function validateChangeReferences(input: {
  assetId?: string | null;
  wikiPageId?: string | null;
}) {
  if (input.assetId && !(await getAssetById(input.assetId))) return "Asset not found";
  if (input.wikiPageId && !(await pageExists(input.wikiPageId))) return "Wiki page not found";
  return null;
}

function defaultSeverity(type: string, severity: string | null | undefined) {
  if (severity) return severity;
  return requiresPostReview(type) ? "high" : null;
}

marketingChangeRoutes.get(
  "/",
  zValidator("query", listChangesQuerySchema),
  withErrorHandler("MARKETING_CHANGES_LIST_FAILED", "Failed to list changes"),
  async (c) => {
    const q = c.req.valid("query");
    const changes = await listChanges({
      status: q.status?.split(",").filter(Boolean),
      type: q.type,
      assetId: q.assetId,
      limit: q.limit ?? 200,
    });
    return c.json(await toDtos(changes));
  }
);

/** Anyone with marketing.view may raise an issue (修了前は Read＋Issue投稿). */
marketingChangeRoutes.post(
  "/",
  zValidator("json", upsertChangeSchema),
  withErrorHandler("MARKETING_CHANGE_CREATE_FAILED", "Failed to create change"),
  async (c) => {
    const input = c.req.valid("json");
    const invalid = await validateChangeReferences(input);
    if (invalid) return jsonError(c, 400, "MARKETING_INVALID_REFERENCE", invalid);
    const change = await createChange(
      {
        ...input,
        severity: defaultSeverity(input.type, input.severity),
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      },
      c.get("user").id
    );
    await auditAction(c, "marketing.change.create", "marketing-change", change.id, {
      type: change.type,
    });
    const [dto] = await toDtos([change]);
    return c.json(dto, 201);
  }
);

marketingChangeRoutes.get(
  "/:id",
  withErrorHandler("MARKETING_CHANGE_FETCH_FAILED", "Failed to fetch change"),
  async (c) => {
    const change = await getChangeById(c.req.param("id"));
    if (!change) return jsonError(c, 404, "NOT_FOUND", "Change not found");
    const events = await listChangeEvents(change.id);
    const [[dto], names] = await Promise.all([
      toDtos([change]),
      getUserNameMap(events.map((e) => e.actorUserId)),
    ]);
    return c.json({ change: dto, events: events.map((e) => toChangeEventDto(e, names)) });
  }
);

/** Edits are allowed before review only; approved content must not drift. */
marketingChangeRoutes.put(
  "/:id",
  zValidator("json", upsertChangeSchema),
  withErrorHandler("MARKETING_CHANGE_UPDATE_FAILED", "Failed to update change"),
  async (c) => {
    const change = await getChangeById(c.req.param("id"));
    if (!change) return jsonError(c, 404, "NOT_FOUND", "Change not found");
    const user = c.get("user");
    const isRequester = change.requestedByUserId === user.id;
    if (!isRequester && !(await hasMarketingPermission(c, MarketingPermission.Operate))) {
      return jsonError(c, 403, "MARKETING_FORBIDDEN", "Only the requester or an operator can edit");
    }
    if (!EDITABLE_STATUSES.has(change.status)) {
      return jsonError(
        c,
        409,
        "MARKETING_INVALID_TRANSITION",
        "Only open or rejected changes can be edited"
      );
    }
    const input = c.req.valid("json");
    const invalid = await validateChangeReferences(input);
    if (invalid) return jsonError(c, 400, "MARKETING_INVALID_REFERENCE", invalid);
    const updated = await applyChangeUpdate({
      id: change.id,
      expectedStatus: change.status,
      patch: {
        ...input,
        severity: defaultSeverity(input.type, input.severity),
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      },
      event: {
        action: "update",
        fromStatus: change.status,
        toStatus: change.status,
        comment: null,
      },
      actorUserId: user.id,
    });
    if (!updated)
      return jsonError(c, 409, "MARKETING_CONFLICT", "The change was modified concurrently");
    await auditAction(c, "marketing.change.update", "marketing-change", change.id);
    const [dto] = await toDtos([updated]);
    return c.json(dto);
  }
);

marketingChangeRoutes.post(
  "/:id/transition",
  zValidator("json", changeTransitionSchema),
  withErrorHandler("MARKETING_CHANGE_TRANSITION_FAILED", "Failed to update change status"),
  async (c) => {
    const change = await getChangeById(c.req.param("id"));
    if (!change) return jsonError(c, 404, "NOT_FOUND", "Change not found");
    const input = c.req.valid("json");
    const user = c.get("user");
    const plan = planChangeTransition(
      change,
      input.action,
      { id: user.id, permissions: await getRequestMarketingPermissions(c) },
      input
    );
    if (!plan.ok) {
      await auditAction(c, "marketing.change.transition_denied", "marketing-change", change.id, {
        action: input.action,
        reason: plan.code,
      });
      return jsonError(c, plan.httpStatus, plan.code, plan.message);
    }
    const updated = await applyChangeUpdate({
      id: change.id,
      expectedStatus: change.status,
      patch: plan.patch,
      event: {
        action: input.action,
        fromStatus: change.status,
        toStatus: plan.toStatus,
        comment: input.comment ?? input.verificationNote ?? null,
      },
      actorUserId: user.id,
    });
    if (!updated)
      return jsonError(c, 409, "MARKETING_CONFLICT", "The change was modified concurrently");
    await auditAction(c, `marketing.change.${input.action}`, "marketing-change", change.id, {
      from: change.status,
      to: plan.toStatus,
    });
    const [dto] = await toDtos([updated]);
    return c.json(dto);
  }
);
