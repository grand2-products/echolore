import {
  type MarketingDashboardDefinition,
  type MarketingDashboardExport,
  MarketingPermission,
} from "@echolore/shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { MarketingDashboard } from "../../db/schema.js";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import { auditAction } from "../../lib/audit.js";
import type { AppEnv } from "../../lib/auth.js";
import { requireMarketingPermission } from "../../policies/marketing-policy.js";
import {
  createDashboard,
  deleteDashboard,
  getDashboardById,
  getDashboardRevision,
  listDashboardRevisions,
  listDashboards,
  updateDashboard,
} from "../../repositories/marketing/marketing-dashboard-repository.js";
import {
  getUserNameMap,
  pageExists,
} from "../../repositories/marketing/marketing-knowledge-repository.js";
import { buildDefaultDashboard } from "../../services/marketing/marketing-dashboard-template.js";
import {
  dashboardDefinitionOf,
  toDashboardDto,
  toDashboardRevisionDto,
} from "../../services/marketing/marketing-dto.js";
import {
  getMarketingSettings,
  updateMarketingSettings,
} from "../../services/marketing/marketing-settings-service.js";
import { createDashboardSchema, importDashboardSchema, updateDashboardSchema } from "./schemas.js";

export const marketingDashboardRoutes = new Hono<AppEnv>();

/** Wiki links must reference live pages so 根拠への導線 never dead-ends. */
async function invalidWikiReference(def: MarketingDashboardDefinition): Promise<string | null> {
  const ids = [def.wikiPageId, ...def.widgets.map((w) => w.wikiPageId)].filter((id): id is string =>
    Boolean(id)
  );
  for (const id of new Set(ids)) {
    if (!(await pageExists(id))) return `Wiki page not found: ${id}`;
  }
  return null;
}

async function dashboardDto(dashboard: MarketingDashboard) {
  const [names, settings] = await Promise.all([
    getUserNameMap([dashboard.createdByUserId, dashboard.updatedByUserId]),
    getMarketingSettings(),
  ]);
  return toDashboardDto(dashboard, names, settings.defaultDashboardId);
}

marketingDashboardRoutes.get(
  "/",
  withErrorHandler("MARKETING_DASHBOARDS_LIST_FAILED", "Failed to list dashboards"),
  async (c) => {
    const [dashboards, settings] = await Promise.all([listDashboards(), getMarketingSettings()]);
    const names = await getUserNameMap(
      dashboards.flatMap((d) => [d.createdByUserId, d.updatedByUserId])
    );
    return c.json(dashboards.map((d) => toDashboardDto(d, names, settings.defaultDashboardId)));
  }
);

marketingDashboardRoutes.post(
  "/",
  requireMarketingPermission(MarketingPermission.Operate),
  zValidator("json", createDashboardSchema),
  withErrorHandler("MARKETING_DASHBOARD_CREATE_FAILED", "Failed to create dashboard"),
  async (c) => {
    const { changeNote, ...definition } = c.req.valid("json");
    const invalid = await invalidWikiReference(definition);
    if (invalid) return jsonError(c, 400, "MARKETING_INVALID_REFERENCE", invalid);
    const dashboard = await createDashboard(definition, changeNote || "Created", c.get("user").id);
    await auditAction(c, "marketing.dashboard.create", "marketing-dashboard", dashboard.id);
    return c.json(await dashboardDto(dashboard), 201);
  }
);

/** Creates the starter dashboard; becomes the default when none is set. */
marketingDashboardRoutes.post(
  "/from-template",
  requireMarketingPermission(MarketingPermission.Operate),
  withErrorHandler("MARKETING_DASHBOARD_CREATE_FAILED", "Failed to create dashboard"),
  async (c) => {
    const settings = await getMarketingSettings();
    const dashboard = await createDashboard(
      buildDefaultDashboard(settings.knowledgeRootPageId),
      "Created from template",
      c.get("user").id
    );
    if (!settings.defaultDashboardId) {
      await updateMarketingSettings({ defaultDashboardId: dashboard.id });
    }
    await auditAction(c, "marketing.dashboard.create", "marketing-dashboard", dashboard.id, {
      template: "default",
    });
    return c.json(await dashboardDto(dashboard), 201);
  }
);

marketingDashboardRoutes.post(
  "/import",
  requireMarketingPermission(MarketingPermission.Operate),
  zValidator("json", importDashboardSchema),
  withErrorHandler("MARKETING_DASHBOARD_IMPORT_FAILED", "Failed to import dashboard"),
  async (c) => {
    const { definition } = c.req.valid("json");
    // Wiki IDs from another instance are dropped rather than rejected.
    const cleaned: MarketingDashboardDefinition = {
      ...definition,
      wikiPageId:
        definition.wikiPageId && (await pageExists(definition.wikiPageId))
          ? definition.wikiPageId
          : null,
      widgets: await Promise.all(
        definition.widgets.map(async (w) => ({
          ...w,
          wikiPageId: w.wikiPageId && (await pageExists(w.wikiPageId)) ? w.wikiPageId : null,
        }))
      ),
    };
    const dashboard = await createDashboard(cleaned, "Imported from JSON", c.get("user").id);
    await auditAction(c, "marketing.dashboard.import", "marketing-dashboard", dashboard.id);
    return c.json(await dashboardDto(dashboard), 201);
  }
);

marketingDashboardRoutes.get(
  "/:id",
  withErrorHandler("MARKETING_DASHBOARD_FETCH_FAILED", "Failed to fetch dashboard"),
  async (c) => {
    const dashboard = await getDashboardById(c.req.param("id"));
    if (!dashboard) return jsonError(c, 404, "NOT_FOUND", "Dashboard not found");
    return c.json(await dashboardDto(dashboard));
  }
);

marketingDashboardRoutes.put(
  "/:id",
  requireMarketingPermission(MarketingPermission.Operate),
  zValidator("json", updateDashboardSchema),
  withErrorHandler("MARKETING_DASHBOARD_UPDATE_FAILED", "Failed to update dashboard"),
  async (c) => {
    const id = c.req.param("id");
    const { changeNote, expectedVersion, ...definition } = c.req.valid("json");
    const invalid = await invalidWikiReference(definition);
    if (invalid) return jsonError(c, 400, "MARKETING_INVALID_REFERENCE", invalid);
    if (!(await getDashboardById(id))) return jsonError(c, 404, "NOT_FOUND", "Dashboard not found");
    const dashboard = await updateDashboard(
      id,
      definition,
      changeNote,
      c.get("user").id,
      expectedVersion ?? null
    );
    if (!dashboard) {
      return jsonError(
        c,
        409,
        "MARKETING_DASHBOARD_CONFLICT",
        "The dashboard was changed by someone else. Reload and apply your edits again."
      );
    }
    await auditAction(c, "marketing.dashboard.update", "marketing-dashboard", id, {
      version: dashboard.version,
      changeNote,
    });
    return c.json(await dashboardDto(dashboard));
  }
);

marketingDashboardRoutes.delete(
  "/:id",
  requireMarketingPermission(MarketingPermission.Manage),
  withErrorHandler("MARKETING_DASHBOARD_DELETE_FAILED", "Failed to delete dashboard"),
  async (c) => {
    const dashboard = await getDashboardById(c.req.param("id"));
    if (!dashboard) return jsonError(c, 404, "NOT_FOUND", "Dashboard not found");
    await deleteDashboard(dashboard.id);
    const settings = await getMarketingSettings();
    if (settings.defaultDashboardId === dashboard.id) {
      await updateMarketingSettings({ defaultDashboardId: null });
    }
    await auditAction(c, "marketing.dashboard.delete", "marketing-dashboard", dashboard.id, {
      name: dashboard.name,
    });
    return c.json({ success: true });
  }
);

marketingDashboardRoutes.get(
  "/:id/revisions",
  withErrorHandler("MARKETING_DASHBOARD_REVISIONS_FAILED", "Failed to list revisions"),
  async (c) => {
    const revisions = await listDashboardRevisions(c.req.param("id"));
    const names = await getUserNameMap(revisions.map((r) => r.authorUserId));
    return c.json(revisions.map((r) => toDashboardRevisionDto(r, names)));
  }
);

/** Restores an earlier version as a new version (history is never rewritten). */
marketingDashboardRoutes.post(
  "/:id/revisions/:version/restore",
  requireMarketingPermission(MarketingPermission.Operate),
  withErrorHandler("MARKETING_DASHBOARD_RESTORE_FAILED", "Failed to restore dashboard"),
  async (c) => {
    const id = c.req.param("id");
    const version = Number(c.req.param("version"));
    if (!Number.isInteger(version)) return jsonError(c, 400, "BAD_REQUEST", "Invalid version");
    const revision = await getDashboardRevision(id, version);
    if (!revision) return jsonError(c, 404, "NOT_FOUND", "Revision not found");
    const definition = revision.definition as unknown as MarketingDashboardDefinition;
    const dashboard = await updateDashboard(
      id,
      {
        ...definition,
        wikiPageId:
          definition.wikiPageId && (await pageExists(definition.wikiPageId))
            ? definition.wikiPageId
            : null,
      },
      `Restored version ${version}`,
      c.get("user").id,
      null
    );
    if (!dashboard) return jsonError(c, 404, "NOT_FOUND", "Dashboard not found");
    await auditAction(c, "marketing.dashboard.restore", "marketing-dashboard", id, { version });
    return c.json(await dashboardDto(dashboard));
  }
);

marketingDashboardRoutes.get(
  "/:id/export",
  withErrorHandler("MARKETING_DASHBOARD_EXPORT_FAILED", "Failed to export dashboard"),
  async (c) => {
    const dashboard = await getDashboardById(c.req.param("id"));
    if (!dashboard) return jsonError(c, 404, "NOT_FOUND", "Dashboard not found");
    const body: MarketingDashboardExport = {
      format: "echolore.marketing-dashboard",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      version: dashboard.version,
      definition: dashboardDefinitionOf(dashboard),
    };
    return c.json(body);
  }
);
