import { MARKETING_METRIC_MAP } from "@echolore/shared/contracts";
import type {
  MarketingConnector,
  MarketingQualityJson,
  MarketingSyncRun,
  NewMarketingMetricDaily,
} from "../../db/schema.js";
import { sendEmail } from "../../lib/email.js";
import { getAssetById } from "../../repositories/marketing/marketing-asset-repository.js";
import {
  claimConnectorRun,
  createSyncRun,
  finishSyncRun,
  getConnectorById,
  listConnectors,
  purgeExpiredMarketingData,
  releaseConnectorRun,
  writeMetricRows,
} from "../../repositories/marketing/marketing-connector-repository.js";
import { getUserById } from "../../repositories/user/user-repository.js";
import { csvToMetricRows } from "./connectors/csv.js";
import { getConnectorDefinition } from "./connectors/registry.js";
import { ConnectorError, type ConnectorMetricRow } from "./connectors/types.js";
import {
  addDays,
  daysBetweenInclusive,
  enumerateDates,
  isIsoDate,
  todayInTimezone,
} from "./marketing-dates.js";
import { decryptSecrets } from "./marketing-secrets.js";
import { getMarketingSettings } from "./marketing-settings-service.js";

const RUN_LOCK_MINUTES = 30;
const SCHEDULER_TICK_MS = 10 * 60 * 1000;
const MAX_RANGE_DAYS = 400;

export class MarketingSyncError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "LOCKED" | "UNSUPPORTED" | "INVALID"
  ) {
    super(message);
    this.name = "MarketingSyncError";
  }
}

// ─── Normalisation & quality checks (品質確認) ────────────────────

export interface NormalizedRows {
  facts: NewMarketingMetricDaily[];
  quality: MarketingQualityJson;
}

/**
 * Validates and de-duplicates connector output before it is written.
 * - rows outside the range, unknown metrics or non-finite values are dropped (invalidRows)
 * - replace mode: duplicate natural keys keep the last value (duplicateKeys)
 * - accumulate mode: duplicate keys are summed
 * - negative values are kept but counted (費用負値 etc. need a human look)
 * - dates without any row are listed (emptyDates) — they are stored as
 *   "fetched, zero", which is different from 未取得
 */
export function normalizeConnectorRows(
  rows: ConnectorMetricRow[],
  opts: {
    connectorId: string;
    source: string;
    from: string;
    to: string;
    mode: "replace" | "accumulate";
    allowedMetrics: string[];
  }
): NormalizedRows {
  const allowed = new Set(opts.allowedMetrics);
  const byKey = new Map<string, NewMarketingMetricDaily>();
  let invalidRows = 0;
  let duplicateKeys = 0;
  let negativeValues = 0;

  for (const row of rows) {
    if (
      !isIsoDate(row.date) ||
      row.date < opts.from ||
      row.date > opts.to ||
      !allowed.has(row.metric) ||
      MARKETING_METRIC_MAP[row.metric]?.kind !== "base" ||
      !Number.isFinite(row.value)
    ) {
      invalidRows++;
      continue;
    }
    if (row.value < 0) negativeValues++;
    const fact: NewMarketingMetricDaily = {
      connectorId: opts.connectorId,
      date: row.date,
      source: opts.source,
      accountId: (row.accountId ?? "").slice(0, 200),
      campaignId: (row.campaignId ?? "").slice(0, 200),
      campaignName: row.campaignName?.slice(0, 500) ?? null,
      segment: (row.segment ?? "").slice(0, 1000),
      metric: row.metric,
      value: row.value,
      currency: row.currency ?? null,
    };
    const key = [fact.date, fact.accountId, fact.campaignId, fact.segment, fact.metric].join(
      "\u0000"
    );
    const existing = byKey.get(key);
    if (existing) {
      if (opts.mode === "accumulate") {
        existing.value += fact.value;
        continue;
      }
      duplicateKeys++;
    }
    byKey.set(key, fact);
  }

  const facts = [...byKey.values()];
  const datesWithRows = new Set(facts.map((f) => f.date));
  const emptyDates = enumerateDates(opts.from, opts.to).filter((d) => !datesWithRows.has(d));
  return {
    facts,
    quality: {
      rowCount: facts.length,
      duplicateKeys,
      negativeValues,
      invalidRows,
      emptyDates,
      warnings: [],
    },
  };
}

function qualityStatus(quality: MarketingQualityJson, alerts: string[]): "success" | "partial" {
  return quality.invalidRows > 0 ||
    quality.duplicateKeys > 0 ||
    quality.negativeValues > 0 ||
    alerts.length > 0
    ? "partial"
    : "success";
}

function safeErrorMessage(err: unknown): string {
  if (err instanceof ConnectorError || err instanceof MarketingSyncError)
    return err.message.slice(0, 1000);
  console.error("[marketing] Unexpected sync error", err);
  return "Unexpected error during sync (see server logs)";
}

// ─── Notifications (エラー通知) ───────────────────────────────────

async function notifyConnectorProblem(connector: MarketingConnector, problem: string) {
  try {
    if (!connector.assetId) return;
    const asset = await getAssetById(connector.assetId);
    if (!asset) return;
    const recipients = await Promise.all(
      [asset.primaryOwnerUserId, asset.secondaryOwnerUserId]
        .filter((id): id is string => Boolean(id))
        .map((id) => getUserById(id))
    );
    const safeName = connector.name.replace(/[\r\n\t]/g, " ").slice(0, 100);
    for (const user of recipients) {
      if (!user?.email || user.deletedAt || user.suspendedAt) continue;
      await sendEmail(
        {
          to: user.email,
          subject: `[Marketing] ${safeName}: data collection needs attention`,
          text: [
            `Connector "${safeName}" (${connector.type}) reported a problem:`,
            "",
            problem.slice(0, 2000),
            "",
            "Dashboards show this source as stale until the next successful run.",
            "Continue operating from the media console in the meantime.",
          ].join("\n"),
        },
        "marketing"
      );
    }
  } catch (err) {
    console.error("[marketing] Failed to send connector notification", err);
  }
}

// ─── Runs ────────────────────────────────────────────────────────

async function executeRun(
  connector: MarketingConnector,
  trigger: "schedule" | "manual" | "csv",
  range: { from: string; to: string },
  actorUserId: string | null,
  produce: () => Promise<{
    rows: ConnectorMetricRow[];
    warnings: string[];
    alerts: string[];
    /** Rows rejected before reaching normalisation (e.g. unparsable CSV lines). */
    preInvalidRows?: number;
  }>,
  mode: "replace" | "accumulate",
  allowedMetrics: string[],
  background = false
): Promise<MarketingSyncRun> {
  const run = await createSyncRun({
    connectorId: connector.id,
    trigger,
    rangeFrom: range.from,
    rangeTo: range.to,
    triggeredByUserId: actorUserId,
  });
  const work = completeRun(connector, run, range, produce, mode, allowedMetrics);
  if (background) {
    work.catch((err) => console.error("[marketing] Background sync failed", err));
    return run;
  }
  return work;
}

async function completeRun(
  connector: MarketingConnector,
  run: MarketingSyncRun,
  range: { from: string; to: string },
  produce: Parameters<typeof executeRun>[4],
  mode: "replace" | "accumulate",
  allowedMetrics: string[]
): Promise<MarketingSyncRun> {
  try {
    const produced = await produce();
    const { facts, quality } = normalizeConnectorRows(produced.rows, {
      connectorId: connector.id,
      source: connector.type,
      from: range.from,
      to: range.to,
      mode,
      allowedMetrics,
    });
    const preInvalid = produced.preInvalidRows ?? 0;
    quality.invalidRows += preInvalid;
    quality.warnings = [...produced.warnings, ...produced.alerts].slice(0, 50);
    const written = await writeMetricRows({
      connectorId: connector.id,
      mode,
      from: range.from,
      to: range.to,
      rows: facts,
      coverageDates: enumerateDates(range.from, range.to),
      runId: run.id,
    });
    const status = qualityStatus(quality, produced.alerts);
    const finished = await finishSyncRun(run.id, {
      status,
      rowsFetched: produced.rows.length + preInvalid,
      rowsWritten: written,
      quality,
      errorMessage: null,
    });
    await releaseConnectorRun(connector.id, { status, error: null, succeeded: true });
    if (produced.alerts.length > 0 && connector.lastStatus === "success") {
      await notifyConnectorProblem(connector, produced.alerts.join("\n"));
    }
    return finished;
  } catch (err) {
    const message = safeErrorMessage(err);
    const finished = await finishSyncRun(run.id, {
      status: "failed",
      rowsFetched: 0,
      rowsWritten: 0,
      quality: null,
      errorMessage: message,
    });
    await releaseConnectorRun(connector.id, { status: "failed", error: message, succeeded: false });
    if (connector.lastStatus !== "failed") {
      await notifyConnectorProblem(connector, message);
    }
    return finished;
  }
}

export function resolveSyncRange(connector: MarketingConnector, now = new Date()) {
  const def = getConnectorDefinition(connector.type);
  const today = todayInTimezone(connector.timezone, now);
  const lookback = Math.min(Math.max(connector.lookbackDays, 1), 90);
  return (
    def?.resolveRange?.(today, lookback) ?? {
      from: addDays(today, -lookback),
      to: addDays(today, -1),
    }
  );
}

/**
 * Fetches the lookback window from the connector's API (日次取得・直近再取得).
 * With `background`, returns the running run as soon as the lock is held.
 */
export async function runConnectorSync(
  connectorId: string,
  trigger: "schedule" | "manual",
  actorUserId: string | null,
  options: { background?: boolean } = {}
): Promise<MarketingSyncRun> {
  const connector = await getConnectorById(connectorId);
  if (!connector) throw new MarketingSyncError("Connector not found", "NOT_FOUND");
  const def = getConnectorDefinition(connector.type);
  if (!def?.supportsSync) {
    throw new MarketingSyncError("This connector only accepts CSV import", "UNSUPPORTED");
  }
  if (!(await claimConnectorRun(connector.id, RUN_LOCK_MINUTES))) {
    throw new MarketingSyncError("A run is already in progress", "LOCKED");
  }
  const range = resolveSyncRange(connector);
  return executeRun(
    connector,
    trigger,
    range,
    actorUserId,
    async () => {
      const result = await def.fetch({
        config: connector.config,
        secrets: decryptSecrets(connector.secretsEnc),
        timezone: connector.timezone,
        currency: connector.currency,
        ...range,
      });
      return { rows: result.rows, warnings: result.warnings, alerts: result.alerts ?? [] };
    },
    def.writeMode,
    def.metrics,
    options.background ?? false
  );
}

/**
 * Imports a CSV export with the same metric definitions (CSV暫定連携).
 * The file's date range (or the explicit range) is replaced as a whole.
 */
export async function importCsvForConnector(
  connectorId: string,
  csvText: string,
  options: { from?: string; to?: string; actorUserId: string }
): Promise<MarketingSyncRun> {
  const connector = await getConnectorById(connectorId);
  if (!connector) throw new MarketingSyncError("Connector not found", "NOT_FOUND");
  const def = getConnectorDefinition(connector.type);
  if (!def) throw new MarketingSyncError("Unknown connector type", "UNSUPPORTED");

  const parsed = csvToMetricRows(csvText, connector.currency);
  const from = options.from ?? parsed.minDate;
  const to = options.to ?? parsed.maxDate;
  if (!from || !to || !isIsoDate(from) || !isIsoDate(to) || from > to) {
    throw new MarketingSyncError("Could not determine a valid date range from the file", "INVALID");
  }
  if (daysBetweenInclusive(from, to) > MAX_RANGE_DAYS) {
    throw new MarketingSyncError(`Date range exceeds ${MAX_RANGE_DAYS} days`, "INVALID");
  }
  const unsupported = [...new Set(parsed.rows.map((r) => r.metric))].filter(
    (m) => !def.metrics.includes(m)
  );
  if (unsupported.length > 0) {
    throw new MarketingSyncError(
      `Metrics not produced by this connector: ${unsupported.join(", ")}`,
      "INVALID"
    );
  }
  if (!(await claimConnectorRun(connector.id, RUN_LOCK_MINUTES))) {
    throw new MarketingSyncError("A run is already in progress", "LOCKED");
  }
  return executeRun(
    connector,
    "csv",
    { from, to },
    options.actorUserId,
    async () => ({
      rows: parsed.rows,
      warnings: parsed.errors,
      alerts: [],
      preInvalidRows: parsed.invalidRows,
    }),
    "replace",
    def.metrics
  );
}

// ─── Scheduler & retention ───────────────────────────────────────

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;
let lastPurgeAt = 0;

export function isConnectorDue(connector: MarketingConnector, now = new Date()): boolean {
  if (!connector.enabled) return false;
  if (!getConnectorDefinition(connector.type)?.supportsSync) return false;
  if (!connector.lastRunAt) return true;
  const intervalMs = Math.max(connector.syncIntervalHours, 1) * 3_600_000;
  return now.getTime() - connector.lastRunAt.getTime() >= intervalMs;
}

export async function runDueConnectors(): Promise<void> {
  const connectors = await listConnectors();
  for (const connector of connectors) {
    if (!isConnectorDue(connector)) continue;
    try {
      await runConnectorSync(connector.id, "schedule", null);
    } catch (err) {
      if (err instanceof MarketingSyncError && err.code === "LOCKED") continue;
      console.error(`[marketing] Scheduled sync failed for ${connector.id}`, err);
    }
  }
}

export async function purgeExpiredData(now = new Date()) {
  const settings = await getMarketingSettings();
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - Math.max(settings.metricsRetentionMonths, 1));
  const runsBefore = new Date(
    now.getTime() - Math.max(settings.runLogRetentionDays, 1) * 86_400_000
  );
  return purgeExpiredMarketingData(cutoff.toISOString().slice(0, 10), runsBefore);
}

async function schedulerTick() {
  try {
    await runDueConnectors();
    if (Date.now() - lastPurgeAt > 24 * 3_600_000) {
      const purged = await purgeExpiredData();
      lastPurgeAt = Date.now();
      if (purged.facts > 0 || purged.runs > 0) {
        console.log(
          JSON.stringify({
            event: "marketing.retention.purged",
            facts: purged.facts,
            runs: purged.runs,
          })
        );
      }
    }
  } catch (err) {
    console.error(JSON.stringify({ event: "marketing.scheduler.error", error: String(err) }));
  } finally {
    schedulerTimer = setTimeout(schedulerTick, SCHEDULER_TICK_MS);
  }
}

export function startMarketingSyncScheduler(): void {
  if (schedulerTimer) return;
  // First tick shortly after boot so restarts don't delay daily fetches.
  schedulerTimer = setTimeout(schedulerTick, 60_000);
}

export function stopMarketingSyncScheduler(): void {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
}
