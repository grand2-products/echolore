import type { MarketingOverviewDto } from "@echolore/shared/contracts";
import {
  listActiveAccessEntries,
  listAssets,
} from "../../repositories/marketing/marketing-asset-repository.js";
import {
  countChangesByStatus,
  countPostReviewOverdue,
} from "../../repositories/marketing/marketing-change-repository.js";
import {
  countSuccessfulRunDays,
  listConnectors,
} from "../../repositories/marketing/marketing-connector-repository.js";
import {
  countPendingReconciliations,
  listKnowledgePages,
} from "../../repositories/marketing/marketing-knowledge-repository.js";
import { getConnectorDefinition } from "./connectors/registry.js";
import { isConnectorStale } from "./marketing-metrics-service.js";
import { getMarketingSettings } from "./marketing-settings-service.js";

const DAY_MS = 86_400_000;
const SUCCESS_WINDOW_DAYS = 28;
const EXPIRING_WITHIN_DAYS = 14;

/**
 * Operating-health figures behind the plan's success metrics:
 * 資産・権限の管理率, 定時更新の達成率, 重要手順の整備率, plus open approvals.
 */
export async function getMarketingOverview(now = new Date()): Promise<MarketingOverviewDto> {
  const windowStart = new Date(now.getTime() - SUCCESS_WINDOW_DAYS * DAY_MS);
  const [
    settings,
    connectors,
    runDays,
    assets,
    access,
    knowledge,
    changeCounts,
    postReviewOverdue,
    pendingRecon,
  ] = await Promise.all([
    getMarketingSettings(),
    listConnectors(),
    countSuccessfulRunDays(windowStart),
    listAssets(),
    listActiveAccessEntries(),
    listKnowledgePages(),
    countChangesByStatus(),
    countPostReviewOverdue(now),
    countPendingReconciliations(),
  ]);

  const syncing = connectors.filter(
    (c) => c.enabled && getConnectorDefinition(c.type)?.supportsSync
  );
  const successDays = new Map(runDays.map((r) => [r.connectorId, r.days]));
  let expected = 0;
  let achieved = 0;
  for (const c of syncing) {
    const start = c.createdAt > windowStart ? c.createdAt : windowStart;
    const days = Math.max(1, Math.floor((now.getTime() - start.getTime()) / DAY_MS));
    expected += days;
    achieved += Math.min(successDays.get(c.id) ?? 0, days);
  }

  const activeAssets = assets.filter((a) => a.status !== "retired");
  const procedures = knowledge.filter(
    (k) => k.docType === "procedure" && k.status !== "deprecated"
  );

  return {
    connectors: {
      total: connectors.length,
      healthy: syncing.filter(
        (c) => !isConnectorStale(c, settings.staleAfterHours, now) && c.lastStatus !== "failed"
      ).length,
      stale: syncing.filter((c) => isConnectorStale(c, settings.staleAfterHours, now)).length,
      failing: syncing.filter((c) => c.lastStatus === "failed").length,
      updateSuccessRate: expected > 0 ? achieved / expected : null,
    },
    assets: {
      total: activeAssets.length,
      withOwnerAndDeputy: activeAssets.filter((a) => a.primaryOwnerUserId && a.secondaryOwnerUserId)
        .length,
      verificationOverdue: activeAssets.filter(
        (a) =>
          !a.lastVerifiedAt ||
          now.getTime() - a.lastVerifiedAt.getTime() > a.verificationIntervalDays * DAY_MS
      ).length,
      expiredAccess: access.filter((e) => e.expiresAt && e.expiresAt < now).length,
      expiringAccess: access.filter(
        (e) =>
          e.expiresAt &&
          e.expiresAt >= now &&
          e.expiresAt.getTime() - now.getTime() <= EXPIRING_WITHIN_DAYS * DAY_MS
      ).length,
    },
    knowledge: {
      total: knowledge.length,
      approved: knowledge.filter((k) => k.status === "approved").length,
      reviewOverdue: knowledge.filter(
        (k) => k.status !== "deprecated" && k.nextReviewAt && k.nextReviewAt < now
      ).length,
      procedureApproved: procedures.filter((k) => k.status === "approved").length,
      procedureTotal: procedures.length,
    },
    changes: {
      open: Object.entries(changeCounts)
        .filter(([status]) => status !== "closed" && status !== "rejected")
        .reduce((sum, [, n]) => sum + n, 0),
      awaitingApproval: changeCounts.in_review ?? 0,
      postReviewOverdue,
    },
    reconciliations: { pending: pendingRecon },
  };
}
