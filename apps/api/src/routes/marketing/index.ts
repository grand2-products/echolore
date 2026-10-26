import { type MarketingMemberDto, MarketingPermission, UserRole } from "@echolore/shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import { auditAction } from "../../lib/audit.js";
import type { AppEnv } from "../../lib/auth.js";
import {
  expandMarketingPermissions,
  getRequestMarketingPermissions,
  requireMarketingPermission,
} from "../../policies/marketing-policy.js";
import { getDashboardById } from "../../repositories/marketing/marketing-dashboard-repository.js";
import { listActiveUsersWithGroupPermissions } from "../../repositories/marketing/marketing-member-repository.js";
import {
  MetricsQueryError,
  queryMarketingMetrics,
} from "../../services/marketing/marketing-metrics-service.js";
import { getMarketingOverview } from "../../services/marketing/marketing-overview-service.js";
import {
  getMarketingSettings,
  updateMarketingSettings,
} from "../../services/marketing/marketing-settings-service.js";
import { marketingAssetRoutes } from "./marketing-assets.js";
import { marketingChangeRoutes } from "./marketing-changes.js";
import { marketingConnectorRoutes } from "./marketing-connectors.js";
import { marketingDashboardRoutes } from "./marketing-dashboards.js";
import { marketingKnowledgeRoutes, marketingPageGovernanceRoutes } from "./marketing-knowledge.js";
import { marketingReconciliationRoutes } from "./marketing-reconciliations.js";
import { metricsQuerySchema, updateMarketingSettingsSchema } from "./schemas.js";

export const marketingRoutes = new Hono<AppEnv>();

// ─── Before the marketing.view gate ──────────────────────────────

/** The caller's own marketing permissions (drives navigation visibility). */
marketingRoutes.get(
  "/access",
  withErrorHandler("MARKETING_ACCESS_FAILED", "Failed to resolve marketing access"),
  async (c) => c.json({ permissions: await getRequestMarketingPermissions(c) })
);

/** Page-level governance banner; authorised by Wiki read access instead. */
marketingRoutes.route("/knowledge/by-page", marketingPageGovernanceRoutes);

// ─── marketing.view required from here on ────────────────────────

marketingRoutes.use("*", requireMarketingPermission(MarketingPermission.View));

marketingRoutes.get(
  "/overview",
  withErrorHandler("MARKETING_OVERVIEW_FAILED", "Failed to load overview"),
  async (c) => c.json(await getMarketingOverview())
);

marketingRoutes.get(
  "/members",
  withErrorHandler("MARKETING_MEMBERS_FAILED", "Failed to list members"),
  async (c) => {
    const users = await listActiveUsersWithGroupPermissions();
    const members: MarketingMemberDto[] = users
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        permissions:
          u.role === UserRole.Admin
            ? expandMarketingPermissions(Object.values(MarketingPermission))
            : expandMarketingPermissions(u.permissions),
      }))
      .filter((m) => m.permissions.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    return c.json(members);
  }
);

marketingRoutes.get(
  "/settings",
  withErrorHandler("MARKETING_SETTINGS_FAILED", "Failed to load settings"),
  async (c) => c.json(await getMarketingSettings())
);

marketingRoutes.put(
  "/settings",
  requireMarketingPermission(MarketingPermission.Manage),
  zValidator("json", updateMarketingSettingsSchema),
  withErrorHandler("MARKETING_SETTINGS_UPDATE_FAILED", "Failed to update settings"),
  async (c) => {
    const input = c.req.valid("json");
    if (input.defaultDashboardId && !(await getDashboardById(input.defaultDashboardId))) {
      return jsonError(c, 400, "MARKETING_INVALID_REFERENCE", "Dashboard not found");
    }
    const settings = await updateMarketingSettings(input);
    await auditAction(c, "marketing.settings.update", "marketing-settings", "marketing", {
      fields: Object.keys(input),
    });
    return c.json(settings);
  }
);

marketingRoutes.post(
  "/metrics/query",
  zValidator("json", metricsQuerySchema),
  withErrorHandler("MARKETING_METRICS_QUERY_FAILED", "Failed to query metrics"),
  async (c) => {
    try {
      return c.json(await queryMarketingMetrics(c.req.valid("json")));
    } catch (err) {
      if (err instanceof MetricsQueryError) {
        return jsonError(c, 400, "MARKETING_INVALID_QUERY", err.message);
      }
      throw err;
    }
  }
);

marketingRoutes.route("/assets", marketingAssetRoutes);
marketingRoutes.route("/connectors", marketingConnectorRoutes);
marketingRoutes.route("/dashboards", marketingDashboardRoutes);
marketingRoutes.route("/changes", marketingChangeRoutes);
marketingRoutes.route("/knowledge", marketingKnowledgeRoutes);
marketingRoutes.route("/reconciliations", marketingReconciliationRoutes);
