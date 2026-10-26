import { MarketingPermission } from "@echolore/shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import { auditAction } from "../../lib/audit.js";
import type { AppEnv, SessionUser } from "../../lib/auth.js";
import { canReadPage } from "../../policies/authorization-policy.js";
import { isSelfApproval, requireMarketingPermission } from "../../policies/marketing-policy.js";
import {
  createKnowledgePage,
  deleteKnowledgePage,
  getKnowledgePageById,
  getKnowledgePageByPageId,
  getPageTitleMap,
  getUserNameMap,
  type KnowledgeRow,
  listKnowledgePages,
  pageExists,
  updateKnowledgePage,
  userExists,
} from "../../repositories/marketing/marketing-knowledge-repository.js";
import { getPageById } from "../../repositories/wiki/wiki-repository.js";
import { knowledgeUserIds, toKnowledgeDto } from "../../services/marketing/marketing-dto.js";
import {
  bootstrapMarketingKnowledge,
  KnowledgeBootstrapError,
  nextReviewDate,
} from "../../services/marketing/marketing-knowledge-service.js";
import {
  bootstrapKnowledgeSchema,
  deprecateKnowledgeSchema,
  registerKnowledgeSchema,
  updateKnowledgeSchema,
} from "./schemas.js";

async function toDtos(rows: KnowledgeRow[]) {
  const [names, titles] = await Promise.all([
    getUserNameMap(rows.flatMap(knowledgeUserIds)),
    getPageTitleMap(rows.map((r) => r.replacedByPageId)),
  ]);
  return rows.map((r) => toKnowledgeDto(r, names, titles));
}

/** Registry entries are only shown for Wiki pages the user may read. */
async function filterReadable(user: SessionUser, rows: KnowledgeRow[]) {
  const checks = await Promise.all(
    rows.map((r) => (r.pageAuthorId ? canReadPage(user, r.pageId, r.pageAuthorId) : false))
  );
  return rows.filter((_, i) => checks[i]);
}

async function validatePeople(input: {
  ownerUserId?: string | null;
  deputyUserId?: string | null;
}) {
  for (const id of [input.ownerUserId, input.deputyUserId]) {
    if (id && !(await userExists(id))) return `User not found: ${id}`;
  }
  if (input.ownerUserId && input.ownerUserId === input.deputyUserId) {
    return "Owner and deputy must be different people";
  }
  return null;
}

/**
 * Governance banner for a Wiki page. Mounted before the marketing.view gate:
 * anyone who can read the page sees its status (承認済み / 廃止と移行先).
 */
export const marketingPageGovernanceRoutes = new Hono<AppEnv>();

marketingPageGovernanceRoutes.get(
  "/:pageId",
  withErrorHandler("MARKETING_GOVERNANCE_FETCH_FAILED", "Failed to fetch page governance"),
  async (c) => {
    const pageId = c.req.param("pageId");
    const page = await getPageById(pageId);
    if (!page || !(await canReadPage(c.get("user"), page.id, page.authorId))) {
      return jsonError(c, 404, "NOT_FOUND", "Page not found");
    }
    const row = await getKnowledgePageByPageId(pageId);
    if (!row) return c.json({ governance: null });
    const [dto] = await toDtos([row]);
    return c.json({ governance: dto });
  }
);

export const marketingKnowledgeRoutes = new Hono<AppEnv>();

marketingKnowledgeRoutes.get(
  "/pages",
  withErrorHandler("MARKETING_KNOWLEDGE_LIST_FAILED", "Failed to list knowledge pages"),
  async (c) => {
    const rows = await filterReadable(c.get("user"), await listKnowledgePages());
    return c.json(await toDtos(rows));
  }
);

marketingKnowledgeRoutes.post(
  "/pages",
  requireMarketingPermission(MarketingPermission.Operate),
  zValidator("json", registerKnowledgeSchema),
  withErrorHandler("MARKETING_KNOWLEDGE_REGISTER_FAILED", "Failed to register page"),
  async (c) => {
    const input = c.req.valid("json");
    const page = await getPageById(input.pageId);
    if (!page || page.deletedAt || !(await canReadPage(c.get("user"), page.id, page.authorId))) {
      return jsonError(c, 404, "NOT_FOUND", "Wiki page not found");
    }
    if (await getKnowledgePageByPageId(page.id)) {
      return jsonError(c, 409, "MARKETING_ALREADY_REGISTERED", "Page is already registered");
    }
    const invalid = await validatePeople(input);
    if (invalid) return jsonError(c, 400, "MARKETING_INVALID_REFERENCE", invalid);
    const created = await createKnowledgePage({
      pageId: page.id,
      layer: input.layer,
      docType: input.docType ?? "general",
      purpose: input.purpose ?? null,
      scope: input.scope ?? null,
      ownerUserId: input.ownerUserId ?? c.get("user").id,
      deputyUserId: input.deputyUserId ?? null,
      reviewIntervalDays: input.reviewIntervalDays ?? 90,
      relatedAssetIds: input.relatedAssetIds ?? [],
      notes: input.notes ?? null,
    });
    await auditAction(c, "marketing.knowledge.register", "marketing-knowledge", created.id, {
      pageId: page.id,
    });
    const row = await getKnowledgePageById(created.id);
    return c.json(row ? (await toDtos([row]))[0] : null, 201);
  }
);

marketingKnowledgeRoutes.put(
  "/pages/:id",
  requireMarketingPermission(MarketingPermission.Operate),
  zValidator("json", updateKnowledgeSchema),
  withErrorHandler("MARKETING_KNOWLEDGE_UPDATE_FAILED", "Failed to update page"),
  async (c) => {
    const existing = await getKnowledgePageById(c.req.param("id"));
    if (!existing) return jsonError(c, 404, "NOT_FOUND", "Knowledge page not found");
    const input = c.req.valid("json");
    const invalid = await validatePeople({
      ownerUserId: input.ownerUserId !== undefined ? input.ownerUserId : existing.ownerUserId,
      deputyUserId: input.deputyUserId !== undefined ? input.deputyUserId : existing.deputyUserId,
    });
    if (invalid) return jsonError(c, 400, "MARKETING_INVALID_REFERENCE", invalid);
    const intervalChanged =
      input.reviewIntervalDays !== undefined &&
      input.reviewIntervalDays !== existing.reviewIntervalDays;
    await updateKnowledgePage(existing.id, {
      ...input,
      ...(intervalChanged && input.reviewIntervalDays
        ? {
            nextReviewAt: nextReviewDate(
              existing.lastReviewedAt ?? existing.createdAt,
              input.reviewIntervalDays
            ),
          }
        : {}),
    });
    await auditAction(c, "marketing.knowledge.update", "marketing-knowledge", existing.id, {
      fields: Object.keys(input),
    });
    const row = await getKnowledgePageById(existing.id);
    return c.json(row ? (await toDtos([row]))[0] : null);
  }
);

/** 承認: reviewer must be neither the document owner nor the page author. */
marketingKnowledgeRoutes.post(
  "/pages/:id/approve",
  requireMarketingPermission(MarketingPermission.Review),
  withErrorHandler("MARKETING_KNOWLEDGE_APPROVE_FAILED", "Failed to approve page"),
  async (c) => {
    const existing = await getKnowledgePageById(c.req.param("id"));
    if (!existing) return jsonError(c, 404, "NOT_FOUND", "Knowledge page not found");
    if (existing.status === "deprecated") {
      return jsonError(
        c,
        409,
        "MARKETING_INVALID_TRANSITION",
        "Deprecated pages cannot be approved"
      );
    }
    const user = c.get("user");
    if (isSelfApproval(user.id, [existing.ownerUserId, existing.pageAuthorId])) {
      return jsonError(
        c,
        403,
        "MARKETING_SELF_APPROVAL",
        "Owners and authors cannot approve their own page"
      );
    }
    const now = new Date();
    await updateKnowledgePage(existing.id, {
      status: "approved",
      approvedByUserId: user.id,
      approvedAt: now,
      lastReviewedAt: now,
      nextReviewAt: nextReviewDate(now, existing.reviewIntervalDays),
    });
    await auditAction(c, "marketing.knowledge.approve", "marketing-knowledge", existing.id, {
      pageId: existing.pageId,
    });
    const row = await getKnowledgePageById(existing.id);
    return c.json(row ? (await toDtos([row]))[0] : null);
  }
);

/** 見直し完了: content was checked and is still valid; schedules the next review. */
marketingKnowledgeRoutes.post(
  "/pages/:id/review",
  requireMarketingPermission(MarketingPermission.Operate),
  withErrorHandler("MARKETING_KNOWLEDGE_REVIEW_FAILED", "Failed to record review"),
  async (c) => {
    const existing = await getKnowledgePageById(c.req.param("id"));
    if (!existing) return jsonError(c, 404, "NOT_FOUND", "Knowledge page not found");
    const now = new Date();
    await updateKnowledgePage(existing.id, {
      lastReviewedAt: now,
      nextReviewAt: nextReviewDate(now, existing.reviewIntervalDays),
    });
    await auditAction(c, "marketing.knowledge.review", "marketing-knowledge", existing.id);
    const row = await getKnowledgePageById(existing.id);
    return c.json(row ? (await toDtos([row]))[0] : null);
  }
);

/** 廃止表示と移行先を残す */
marketingKnowledgeRoutes.post(
  "/pages/:id/deprecate",
  requireMarketingPermission(MarketingPermission.Operate),
  zValidator("json", deprecateKnowledgeSchema),
  withErrorHandler("MARKETING_KNOWLEDGE_DEPRECATE_FAILED", "Failed to deprecate page"),
  async (c) => {
    const existing = await getKnowledgePageById(c.req.param("id"));
    if (!existing) return jsonError(c, 404, "NOT_FOUND", "Knowledge page not found");
    const input = c.req.valid("json");
    if (input.replacedByPageId) {
      if (input.replacedByPageId === existing.pageId) {
        return jsonError(c, 400, "MARKETING_INVALID_REFERENCE", "A page cannot replace itself");
      }
      if (!(await pageExists(input.replacedByPageId))) {
        return jsonError(c, 400, "MARKETING_INVALID_REFERENCE", "Replacement page not found");
      }
    }
    await updateKnowledgePage(existing.id, {
      status: "deprecated",
      replacedByPageId: input.replacedByPageId ?? null,
      notes: input.reason
        ? [existing.notes, `廃止理由: ${input.reason}`].filter(Boolean).join("\n")
        : existing.notes,
    });
    await auditAction(c, "marketing.knowledge.deprecate", "marketing-knowledge", existing.id, {
      replacedByPageId: input.replacedByPageId ?? null,
    });
    const row = await getKnowledgePageById(existing.id);
    return c.json(row ? (await toDtos([row]))[0] : null);
  }
);

marketingKnowledgeRoutes.delete(
  "/pages/:id",
  requireMarketingPermission(MarketingPermission.Manage),
  withErrorHandler("MARKETING_KNOWLEDGE_DELETE_FAILED", "Failed to unregister page"),
  async (c) => {
    const existing = await getKnowledgePageById(c.req.param("id"));
    if (!existing) return jsonError(c, 404, "NOT_FOUND", "Knowledge page not found");
    await deleteKnowledgePage(existing.id);
    await auditAction(c, "marketing.knowledge.unregister", "marketing-knowledge", existing.id, {
      pageId: existing.pageId,
    });
    return c.json({ success: true });
  }
);

marketingKnowledgeRoutes.post(
  "/bootstrap",
  requireMarketingPermission(MarketingPermission.Manage),
  zValidator("json", bootstrapKnowledgeSchema),
  withErrorHandler("MARKETING_KNOWLEDGE_BOOTSTRAP_FAILED", "Failed to create knowledge pages"),
  async (c) => {
    const { groupId } = c.req.valid("json");
    try {
      const result = await bootstrapMarketingKnowledge(c.get("user"), groupId ?? null);
      await auditAction(
        c,
        "marketing.knowledge.bootstrap",
        "marketing-knowledge",
        result.rootPageId,
        {
          spaceId: result.spaceId,
          pages: result.createdPageIds.length,
        }
      );
      return c.json(result, 201);
    } catch (err) {
      if (err instanceof KnowledgeBootstrapError) {
        return jsonError(
          c,
          err.code === "GROUP_NOT_FOUND" ? 400 : 409,
          `MARKETING_${err.code}`,
          err.message
        );
      }
      throw err;
    }
  }
);
