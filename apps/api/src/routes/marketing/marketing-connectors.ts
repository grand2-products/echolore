import {
  CONNECTOR_LINKED_ASSET_TYPES,
  type MarketingConnectorType,
  MarketingPermission,
  normalizeConnectorConfig,
} from "@echolore/shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import { auditAction } from "../../lib/audit.js";
import type { AppEnv } from "../../lib/auth.js";
import { requireMarketingPermission } from "../../policies/marketing-policy.js";
import {
  getAssetById,
  listAssets,
} from "../../repositories/marketing/marketing-asset-repository.js";
import {
  createConnector,
  deleteConnector,
  getConnectorById,
  listConnectors,
  listSyncRuns,
  updateConnector,
} from "../../repositories/marketing/marketing-connector-repository.js";
import { getUserNameMap } from "../../repositories/marketing/marketing-knowledge-repository.js";
import { CsvFormatError } from "../../services/marketing/connectors/csv.js";
import {
  getConnectorDefinition,
  listConnectorTypes,
} from "../../services/marketing/connectors/registry.js";
import {
  type AccountLocale,
  ConnectorError,
  configBool,
  type MarketingConnectorDefinition,
} from "../../services/marketing/connectors/types.js";
import { isValidTimezone } from "../../services/marketing/marketing-dates.js";
import { toConnectorDto, toSyncRunDto } from "../../services/marketing/marketing-dto.js";
import {
  decryptSecrets,
  encryptSecrets,
  mergeSecrets,
} from "../../services/marketing/marketing-secrets.js";
import { getMarketingSettings } from "../../services/marketing/marketing-settings-service.js";
import {
  importCsvForConnector,
  MarketingSyncError,
  runConnectorSync,
} from "../../services/marketing/marketing-sync-service.js";
import { createConnectorSchema, csvImportSchema, updateConnectorSchema } from "./schemas.js";

export const marketingConnectorRoutes = new Hono<AppEnv>();

const SYNC_ERROR_STATUS = { NOT_FOUND: 404, LOCKED: 409, UNSUPPORTED: 400, INVALID: 400 } as const;

/** Keeps only declared config keys so arbitrary data cannot be stored. */
function pickConfig(type: string, config: Record<string, unknown> | undefined) {
  const def = getConnectorDefinition(type);
  const allowed = new Set(def?.configFields.map((f) => f.key) ?? []);
  return Object.fromEntries(Object.entries(config ?? {}).filter(([key]) => allowed.has(key)));
}

function canonicalConfig(type: string, config: Record<string, unknown> | undefined) {
  return normalizeConnectorConfig(type as MarketingConnectorType, pickConfig(type, config));
}

/**
 * New links and asset changes must match the connector. Keeping the same
 * asset id, including a historical mismatch, is allowed.
 */
async function assetLinkError(
  connectorType: string,
  assetId: string | null | undefined,
  previousAssetId?: string | null
): Promise<string | null> {
  if (assetId === undefined || assetId === null) return null;
  const asset = await getAssetById(assetId);
  if (!asset) return "NOT_FOUND";
  if (previousAssetId && assetId === previousAssetId) return null;
  const allowed = CONNECTOR_LINKED_ASSET_TYPES[connectorType as MarketingConnectorType];
  if (allowed && !allowed.includes(asset.type as never)) {
    return `${connectorType} connector can only link a ${allowed.join(" or ")} asset`;
  }
  return null;
}

async function assetNameMap() {
  return new Map((await listAssets()).map((a) => [a.id, a.name]));
}

/** True when a source read can be attempted. An empty secret is not enough. */
function credentialsResolvable(
  def: MarketingConnectorDefinition,
  secrets: Record<string, string>,
  config: Record<string, unknown>
): boolean {
  if (configBool(config, "useGcpDefaults")) return true;
  return def.secretFields.some((field) => Boolean(secrets[field.key]?.trim()));
}

/**
 * Reads timezone and currency from the account or property.
 * Returns null without a network call when this type has no source locale,
 * or when no credential is available yet.
 */
async function resolveAccountLocale(
  def: MarketingConnectorDefinition,
  config: Record<string, unknown>,
  secrets: Record<string, string>,
  requireRead: boolean
): Promise<AccountLocale | null> {
  if (!def.readAccountLocale || !requireRead) return null;
  return def.readAccountLocale({
    config,
    secrets,
    timezone: "UTC",
    currency: null,
  });
}

marketingConnectorRoutes.get("/types", (c) => c.json(listConnectorTypes()));

marketingConnectorRoutes.get(
  "/",
  withErrorHandler("MARKETING_CONNECTORS_LIST_FAILED", "Failed to list connectors"),
  async (c) => {
    const [connectors, assets, settings] = await Promise.all([
      listConnectors(),
      assetNameMap(),
      getMarketingSettings(),
    ]);
    return c.json(connectors.map((x) => toConnectorDto(x, assets, settings.staleAfterHours)));
  }
);

marketingConnectorRoutes.post(
  "/",
  requireMarketingPermission(MarketingPermission.Manage),
  zValidator("json", createConnectorSchema),
  withErrorHandler("MARKETING_CONNECTOR_CREATE_FAILED", "Failed to create connector"),
  async (c) => {
    const input = c.req.valid("json");
    const def = getConnectorDefinition(input.type);
    if (!def) return jsonError(c, 400, "MARKETING_INVALID_CONNECTOR", "Unknown connector type");
    const normalized = canonicalConfig(input.type, input.config);
    if (!normalized.ok) return jsonError(c, 400, "MARKETING_INVALID_CONFIG", normalized.message);
    const config = normalized.value;
    const linkError = await assetLinkError(input.type, input.assetId ?? null);
    if (linkError === "NOT_FOUND") {
      return jsonError(c, 400, "MARKETING_INVALID_REFERENCE", "Asset not found");
    }
    if (linkError) return jsonError(c, 400, "MARKETING_ASSET_TYPE_MISMATCH", linkError);
    const secrets = mergeSecrets(
      {},
      input.secrets,
      def.secretFields.map((f) => f.key)
    );
    let timezone: string | null;
    let currency: string | null;
    if (def.readAccountLocale) {
      const requireRead = credentialsResolvable(def, secrets, config);
      try {
        const locale = await resolveAccountLocale(def, config, secrets, requireRead);
        timezone = locale?.timezone ?? null;
        currency = locale?.currency ?? null;
      } catch (err) {
        if (err instanceof ConnectorError) {
          return jsonError(c, 400, "MARKETING_INVALID_CONFIG", err.message);
        }
        throw err;
      }
    } else {
      timezone = input.timezone ?? "Asia/Tokyo";
      if (!isValidTimezone(timezone)) {
        return jsonError(c, 400, "MARKETING_INVALID_CONFIG", "Unknown timezone");
      }
      currency = input.currency ?? null;
    }
    const connector = await createConnector({
      name: input.name,
      type: input.type,
      assetId: input.assetId ?? null,
      config,
      secretsEnc: encryptSecrets(secrets),
      enabled: input.enabled ?? true,
      syncIntervalHours: input.syncIntervalHours ?? (input.type === "lp_monitor" ? 1 : 24),
      lookbackDays: input.lookbackDays ?? 7,
      timezone,
      currency,
      createdByUserId: c.get("user").id,
    });
    await auditAction(c, "marketing.connector.create", "marketing-connector", connector.id, {
      type: connector.type,
      secretKeys: Object.keys(secrets),
    });
    const settings = await getMarketingSettings();
    return c.json(toConnectorDto(connector, await assetNameMap(), settings.staleAfterHours), 201);
  }
);

marketingConnectorRoutes.get(
  "/:id",
  withErrorHandler("MARKETING_CONNECTOR_FETCH_FAILED", "Failed to fetch connector"),
  async (c) => {
    const connector = await getConnectorById(c.req.param("id"));
    if (!connector) return jsonError(c, 404, "NOT_FOUND", "Connector not found");
    const settings = await getMarketingSettings();
    return c.json(toConnectorDto(connector, await assetNameMap(), settings.staleAfterHours));
  }
);

marketingConnectorRoutes.put(
  "/:id",
  requireMarketingPermission(MarketingPermission.Manage),
  zValidator("json", updateConnectorSchema),
  withErrorHandler("MARKETING_CONNECTOR_UPDATE_FAILED", "Failed to update connector"),
  async (c) => {
    const existing = await getConnectorById(c.req.param("id"));
    if (!existing) return jsonError(c, 404, "NOT_FOUND", "Connector not found");
    const def = getConnectorDefinition(existing.type);
    if (!def) return jsonError(c, 400, "MARKETING_INVALID_CONNECTOR", "Unknown connector type");
    const input = c.req.valid("json");
    let config: Record<string, unknown> | undefined;
    if (input.config !== undefined) {
      const normalized = canonicalConfig(existing.type, input.config);
      if (!normalized.ok) return jsonError(c, 400, "MARKETING_INVALID_CONFIG", normalized.message);
      config = normalized.value;
    }
    const linkError = await assetLinkError(existing.type, input.assetId, existing.assetId);
    if (linkError === "NOT_FOUND") {
      return jsonError(c, 400, "MARKETING_INVALID_REFERENCE", "Asset not found");
    }
    if (linkError) return jsonError(c, 400, "MARKETING_ASSET_TYPE_MISMATCH", linkError);
    const secretKeys = def.secretFields.map((f) => f.key);
    const secretsTouched = input.secrets !== undefined;
    const configTouched = config !== undefined;
    const localeTouched = Boolean(def.readAccountLocale) && (secretsTouched || configTouched);
    const nextSecrets =
      secretsTouched || localeTouched
        ? secretsTouched
          ? mergeSecrets(decryptSecrets(existing.secretsEnc), input.secrets, secretKeys)
          : decryptSecrets(existing.secretsEnc)
        : undefined;
    const secretsEnc = secretsTouched ? encryptSecrets(nextSecrets ?? {}) : undefined;
    const patch: Parameters<typeof updateConnector>[1] = {
      name: input.name,
      assetId: input.assetId,
      config,
      secretsEnc,
      enabled: input.enabled,
      syncIntervalHours: input.syncIntervalHours,
      lookbackDays: input.lookbackDays,
    };
    if (def.readAccountLocale) {
      if (localeTouched && nextSecrets) {
        const nextConfig = config ?? existing.config;
        if (credentialsResolvable(def, nextSecrets, nextConfig)) {
          try {
            const locale = await resolveAccountLocale(def, nextConfig, nextSecrets, true);
            patch.timezone = locale?.timezone ?? null;
            patch.currency = locale?.currency ?? null;
          } catch (err) {
            if (err instanceof ConnectorError) {
              return jsonError(c, 400, "MARKETING_INVALID_CONFIG", err.message);
            }
            throw err;
          }
        } else {
          patch.timezone = null;
          patch.currency = null;
        }
      }
    } else {
      if (input.timezone !== undefined) {
        if (!isValidTimezone(input.timezone)) {
          return jsonError(c, 400, "MARKETING_INVALID_CONFIG", "Unknown timezone");
        }
        patch.timezone = input.timezone;
      }
      if (input.currency !== undefined) patch.currency = input.currency;
    }
    const updated = await updateConnector(existing.id, patch);
    await auditAction(c, "marketing.connector.update", "marketing-connector", existing.id, {
      fields: Object.keys(input).filter((k) => k !== "secrets"),
      secretKeysChanged: Object.keys(input.secrets ?? {}),
    });
    const settings = await getMarketingSettings();
    return c.json(
      toConnectorDto(updated ?? existing, await assetNameMap(), settings.staleAfterHours)
    );
  }
);

marketingConnectorRoutes.delete(
  "/:id",
  requireMarketingPermission(MarketingPermission.Manage),
  withErrorHandler("MARKETING_CONNECTOR_DELETE_FAILED", "Failed to delete connector"),
  async (c) => {
    const existing = await getConnectorById(c.req.param("id"));
    if (!existing) return jsonError(c, 404, "NOT_FOUND", "Connector not found");
    await deleteConnector(existing.id);
    await auditAction(c, "marketing.connector.delete", "marketing-connector", existing.id, {
      name: existing.name,
      type: existing.type,
    });
    return c.json({ success: true });
  }
);

marketingConnectorRoutes.post(
  "/:id/test",
  requireMarketingPermission(MarketingPermission.Manage),
  withErrorHandler("MARKETING_CONNECTOR_TEST_FAILED", "Failed to test connector"),
  async (c) => {
    const connector = await getConnectorById(c.req.param("id"));
    if (!connector) return jsonError(c, 404, "NOT_FOUND", "Connector not found");
    const def = getConnectorDefinition(connector.type);
    if (!def) return jsonError(c, 400, "MARKETING_INVALID_CONNECTOR", "Unknown connector type");
    try {
      const result = await def.test({
        config: connector.config,
        secrets: decryptSecrets(connector.secretsEnc),
        timezone: connector.timezone ?? "UTC",
        currency: connector.currency,
      });
      if (result.ok && result.timezone && result.currency) {
        await updateConnector(connector.id, {
          timezone: result.timezone,
          currency: result.currency,
        });
      }
      await auditAction(c, "marketing.connector.test", "marketing-connector", connector.id, {
        ok: result.ok,
      });
      return c.json({ ok: result.ok, message: result.message });
    } catch (err) {
      const message = err instanceof ConnectorError ? err.message : "Connection test failed";
      if (!(err instanceof ConnectorError)) console.error("[marketing] connector test", err);
      await auditAction(c, "marketing.connector.test", "marketing-connector", connector.id, {
        ok: false,
      });
      return c.json({ ok: false, message });
    }
  }
);

marketingConnectorRoutes.post(
  "/:id/sync",
  requireMarketingPermission(MarketingPermission.Manage),
  withErrorHandler("MARKETING_CONNECTOR_SYNC_FAILED", "Failed to start sync"),
  async (c) => {
    try {
      const run = await runConnectorSync(c.req.param("id"), "manual", c.get("user").id, {
        background: true,
      });
      await auditAction(c, "marketing.connector.sync", "marketing-connector", run.connectorId, {
        runId: run.id,
      });
      const names = await getUserNameMap([run.triggeredByUserId]);
      return c.json(toSyncRunDto(run, names), 202);
    } catch (err) {
      if (err instanceof MarketingSyncError) {
        return jsonError(c, SYNC_ERROR_STATUS[err.code], `MARKETING_SYNC_${err.code}`, err.message);
      }
      throw err;
    }
  }
);

marketingConnectorRoutes.post(
  "/:id/import",
  requireMarketingPermission(MarketingPermission.Operate),
  zValidator("json", csvImportSchema),
  withErrorHandler("MARKETING_CSV_IMPORT_FAILED", "Failed to import CSV"),
  async (c) => {
    const input = c.req.valid("json");
    try {
      const run = await importCsvForConnector(c.req.param("id"), input.csv, {
        from: input.from,
        to: input.to,
        actorUserId: c.get("user").id,
      });
      await auditAction(
        c,
        "marketing.connector.csv_import",
        "marketing-connector",
        run.connectorId,
        {
          runId: run.id,
          rangeFrom: run.rangeFrom,
          rangeTo: run.rangeTo,
          rowsWritten: run.rowsWritten,
        }
      );
      const names = await getUserNameMap([run.triggeredByUserId]);
      return c.json({ run: toSyncRunDto(run, names) });
    } catch (err) {
      if (err instanceof CsvFormatError) {
        return jsonError(c, 400, "MARKETING_CSV_INVALID", err.message);
      }
      if (err instanceof MarketingSyncError) {
        return jsonError(c, SYNC_ERROR_STATUS[err.code], `MARKETING_SYNC_${err.code}`, err.message);
      }
      throw err;
    }
  }
);

marketingConnectorRoutes.get(
  "/:id/runs",
  withErrorHandler("MARKETING_RUNS_LIST_FAILED", "Failed to list runs"),
  async (c) => {
    const connector = await getConnectorById(c.req.param("id"));
    if (!connector) return jsonError(c, 404, "NOT_FOUND", "Connector not found");
    const runs = await listSyncRuns(connector.id);
    const names = await getUserNameMap(runs.map((r) => r.triggeredByUserId));
    return c.json(runs.map((r) => toSyncRunDto(r, names)));
  }
);
