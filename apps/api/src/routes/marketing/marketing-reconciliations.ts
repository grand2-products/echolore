import { MARKETING_METRIC_MAP, MarketingPermission } from "@echolore/shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { MarketingReconciliation } from "../../db/schema.js";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import { auditAction } from "../../lib/audit.js";
import type { AppEnv } from "../../lib/auth.js";
import { isSelfApproval, requireMarketingPermission } from "../../policies/marketing-policy.js";
import {
  getConnectorById,
  listConnectors,
} from "../../repositories/marketing/marketing-connector-repository.js";
import {
  createReconciliation,
  getReconciliationById,
  getUserNameMap,
  listReconciliations,
  reviewReconciliation,
} from "../../repositories/marketing/marketing-knowledge-repository.js";
import { sumMetricForConnector } from "../../repositories/marketing/marketing-metrics-repository.js";
import { getConnectorDefinition } from "../../services/marketing/connectors/registry.js";
import { daysBetweenInclusive } from "../../services/marketing/marketing-dates.js";
import { toReconciliationDto } from "../../services/marketing/marketing-dto.js";
import { createReconciliationSchema, reviewReconciliationSchema } from "./schemas.js";

export const marketingReconciliationRoutes = new Hono<AppEnv>();

async function toDtos(rows: MarketingReconciliation[]) {
  const [names, connectors] = await Promise.all([
    getUserNameMap(rows.flatMap((r) => [r.createdByUserId, r.reviewedByUserId])),
    listConnectors(),
  ]);
  const connectorNames = new Map(connectors.map((c) => [c.id, c.name]));
  return rows.map((r) => toReconciliationDto(r, names, connectorNames));
}

marketingReconciliationRoutes.get(
  "/",
  withErrorHandler("MARKETING_RECONCILIATIONS_LIST_FAILED", "Failed to list reconciliations"),
  async (c) => c.json(await toDtos(await listReconciliations()))
);

/** The system value is always computed server-side from stored data. */
marketingReconciliationRoutes.post(
  "/",
  requireMarketingPermission(MarketingPermission.Operate),
  zValidator("json", createReconciliationSchema),
  withErrorHandler("MARKETING_RECONCILIATION_CREATE_FAILED", "Failed to record reconciliation"),
  async (c) => {
    const input = c.req.valid("json");
    if (
      input.periodFrom > input.periodTo ||
      daysBetweenInclusive(input.periodFrom, input.periodTo) > 400
    ) {
      return jsonError(c, 400, "BAD_REQUEST", "Invalid period");
    }
    const connector = await getConnectorById(input.connectorId);
    if (!connector) return jsonError(c, 404, "NOT_FOUND", "Connector not found");
    const def = getConnectorDefinition(connector.type);
    if (
      MARKETING_METRIC_MAP[input.metric]?.kind !== "base" ||
      !def?.metrics.includes(input.metric)
    ) {
      return jsonError(c, 400, "BAD_REQUEST", "Metric is not produced by this connector");
    }
    const systemValue = await sumMetricForConnector(
      connector.id,
      input.metric,
      input.periodFrom,
      input.periodTo
    );
    const row = await createReconciliation({
      connectorId: connector.id,
      metric: input.metric,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      systemValue,
      sourceValue: input.sourceValue,
      tolerancePct: input.tolerancePct ?? 1,
      explanation: input.explanation ?? null,
      createdByUserId: c.get("user").id,
    });
    await auditAction(c, "marketing.reconciliation.create", "marketing-reconciliation", row.id, {
      connectorId: connector.id,
      metric: input.metric,
    });
    const [dto] = await toDtos([row]);
    return c.json(dto, 201);
  }
);

marketingReconciliationRoutes.post(
  "/:id/review",
  requireMarketingPermission(MarketingPermission.Review),
  zValidator("json", reviewReconciliationSchema),
  withErrorHandler("MARKETING_RECONCILIATION_REVIEW_FAILED", "Failed to review reconciliation"),
  async (c) => {
    const existing = await getReconciliationById(c.req.param("id"));
    if (!existing) return jsonError(c, 404, "NOT_FOUND", "Reconciliation not found");
    const user = c.get("user");
    if (isSelfApproval(user.id, [existing.createdByUserId])) {
      return jsonError(
        c,
        403,
        "MARKETING_SELF_APPROVAL",
        "You cannot review your own reconciliation"
      );
    }
    const input = c.req.valid("json");
    if (input.decision === "approved") {
      const withinTolerance =
        existing.sourceValue !== 0
          ? (Math.abs(existing.sourceValue - existing.systemValue) /
              Math.abs(existing.sourceValue)) *
              100 <=
            existing.tolerancePct
          : existing.systemValue === 0;
      // A difference beyond tolerance can be accepted only with an explanation (原因で説明).
      if (!withinTolerance && !existing.explanation?.trim()) {
        return jsonError(
          c,
          400,
          "MARKETING_EXPLANATION_REQUIRED",
          "Differences beyond tolerance need an explanation before approval"
        );
      }
    }
    const updated = await reviewReconciliation(existing.id, {
      status: input.decision,
      reviewedByUserId: user.id,
      reviewComment: input.comment ?? null,
    });
    if (!updated) return jsonError(c, 409, "MARKETING_CONFLICT", "Already reviewed");
    await auditAction(
      c,
      `marketing.reconciliation.${input.decision}`,
      "marketing-reconciliation",
      existing.id
    );
    const [dto] = await toDtos([updated]);
    return c.json(dto);
  }
);
