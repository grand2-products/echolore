import { sql } from "kysely";
import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import type {
  MarketingConnector,
  MarketingQualityJson,
  MarketingSyncRun,
  NewMarketingMetricDaily,
} from "../../db/schema.js";

// ─── Connectors ──────────────────────────────────────────────────

export async function listConnectors(): Promise<MarketingConnector[]> {
  return db.selectFrom("marketing_connectors").selectAll().orderBy("name").execute();
}

export async function getConnectorById(id: string): Promise<MarketingConnector | null> {
  return (
    (await db
      .selectFrom("marketing_connectors")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst()) ?? null
  );
}

export async function createConnector(input: {
  name: string;
  type: string;
  assetId: string | null;
  config: Record<string, unknown>;
  secretsEnc: string | null;
  enabled: boolean;
  syncIntervalHours: number;
  lookbackDays: number;
  timezone: string;
  currency: string | null;
  createdByUserId: string;
}): Promise<MarketingConnector> {
  const now = new Date();
  return db
    .insertInto("marketing_connectors")
    .values({
      id: `mkc_${nanoid(16)}`,
      ...input,
      lastRunAt: null,
      lastSuccessAt: null,
      lastStatus: null,
      lastError: null,
      runLockUntil: null,
      createdAt: now,
      updatedAt: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateConnector(
  id: string,
  input: Partial<{
    name: string;
    assetId: string | null;
    config: Record<string, unknown>;
    secretsEnc: string | null;
    enabled: boolean;
    syncIntervalHours: number;
    lookbackDays: number;
    timezone: string;
    currency: string | null;
  }>
): Promise<MarketingConnector | null> {
  return (
    (await db
      .updateTable("marketing_connectors")
      .set({ ...input, updatedAt: new Date() })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function deleteConnector(id: string): Promise<void> {
  await db.deleteFrom("marketing_connectors").where("id", "=", id).execute();
}

/**
 * Atomically claims a connector for a run. Returns false when another
 * process (or replica) holds a live lock — prevents duplicate fetches.
 */
export async function claimConnectorRun(id: string, lockMinutes: number): Promise<boolean> {
  const row = await db
    .updateTable("marketing_connectors")
    .set({
      runLockUntil: sql<Date>`now() + make_interval(mins => ${lockMinutes})`,
      lastRunAt: new Date(),
    })
    .where("id", "=", id)
    .where((eb) =>
      eb.or([eb("runLockUntil", "is", null), eb("runLockUntil", "<", sql<Date>`now()`)])
    )
    .returning("id")
    .executeTakeFirst();
  return Boolean(row);
}

export async function releaseConnectorRun(
  id: string,
  result: { status: string; error: string | null; succeeded: boolean }
): Promise<void> {
  await db
    .updateTable("marketing_connectors")
    .set({
      runLockUntil: null,
      lastStatus: result.status,
      lastError: result.error,
      ...(result.succeeded ? { lastSuccessAt: new Date() } : {}),
    })
    .where("id", "=", id)
    .execute();
}

// ─── Sync runs ───────────────────────────────────────────────────

export async function createSyncRun(input: {
  connectorId: string;
  trigger: string;
  rangeFrom: string;
  rangeTo: string;
  triggeredByUserId: string | null;
}): Promise<MarketingSyncRun> {
  return db
    .insertInto("marketing_sync_runs")
    .values({
      id: `mkr_${nanoid(16)}`,
      ...input,
      status: "running",
      quality: null,
      errorMessage: null,
      startedAt: new Date(),
      finishedAt: null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function finishSyncRun(
  id: string,
  input: {
    status: string;
    rowsFetched: number;
    rowsWritten: number;
    quality: MarketingQualityJson | null;
    errorMessage: string | null;
  }
): Promise<MarketingSyncRun> {
  return db
    .updateTable("marketing_sync_runs")
    .set({ ...input, finishedAt: new Date() })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function listSyncRuns(connectorId: string, limit = 50): Promise<MarketingSyncRun[]> {
  return db
    .selectFrom("marketing_sync_runs")
    .selectAll()
    .where("connectorId", "=", connectorId)
    .orderBy("startedAt", "desc")
    .limit(limit)
    .execute();
}

/** Distinct days (UTC) with a successful run per connector since `since`. */
export async function countSuccessfulRunDays(
  since: Date
): Promise<Array<{ connectorId: string; days: number }>> {
  const rows = await db
    .selectFrom("marketing_sync_runs")
    .select(["connectorId", sql<string>`count(distinct date_trunc('day', started_at))`.as("days")])
    .where("startedAt", ">=", since)
    .where("status", "in", ["success", "partial"])
    .where("trigger", "=", "schedule")
    .groupBy("connectorId")
    .execute();
  return rows.map((r) => ({ connectorId: r.connectorId, days: Number(r.days) }));
}

// ─── Daily facts & coverage ──────────────────────────────────────

const INSERT_BATCH = 1000;

/**
 * Writes one run's rows in a single transaction.
 * replace: rows in [from, to] are deleted first (重複排除 / 再取得).
 * accumulate: values are added to existing rows for the same key.
 * Coverage rows are upserted for every date in the run's range.
 */
export async function writeMetricRows(input: {
  connectorId: string;
  mode: "replace" | "accumulate";
  from: string;
  to: string;
  rows: NewMarketingMetricDaily[];
  coverageDates: string[];
  runId: string;
}): Promise<number> {
  return db.transaction().execute(async (trx) => {
    if (input.mode === "replace") {
      await trx
        .deleteFrom("marketing_metrics_daily")
        .where("connectorId", "=", input.connectorId)
        .where("date", ">=", input.from)
        .where("date", "<=", input.to)
        .execute();
    }
    for (let i = 0; i < input.rows.length; i += INSERT_BATCH) {
      const batch = input.rows.slice(i, i + INSERT_BATCH);
      let query = trx.insertInto("marketing_metrics_daily").values(batch);
      if (input.mode === "accumulate") {
        query = query.onConflict((oc) =>
          oc
            .columns(["connectorId", "date", "accountId", "campaignId", "segment", "metric"])
            .doUpdateSet({
              value: sql<number>`marketing_metrics_daily.value + excluded.value`,
              fetchedAt: sql<Date>`now()`,
            })
        );
      }
      await query.execute();
    }
    if (input.coverageDates.length > 0) {
      await trx
        .insertInto("marketing_metric_coverage")
        .values(
          input.coverageDates.map((date) => ({
            connectorId: input.connectorId,
            date,
            runId: input.runId,
          }))
        )
        .onConflict((oc) =>
          oc.columns(["connectorId", "date"]).doUpdateSet({
            runId: input.runId,
            fetchedAt: sql<Date>`now()`,
          })
        )
        .execute();
    }
    return input.rows.length;
  });
}

export async function listCoveredDates(
  connectorIds: string[],
  from: string,
  to: string
): Promise<Array<{ connectorId: string; date: string }>> {
  if (connectorIds.length === 0) return [];
  return db
    .selectFrom("marketing_metric_coverage")
    .select(["connectorId", "date"])
    .where("connectorId", "in", connectorIds)
    .where("date", ">=", from)
    .where("date", "<=", to)
    .execute();
}

/** Retention (保存期間): drop facts/coverage before `beforeDate` and run logs before `runsBefore`. */
export async function purgeExpiredMarketingData(beforeDate: string, runsBefore: Date) {
  const facts = await db
    .deleteFrom("marketing_metrics_daily")
    .where("date", "<", beforeDate)
    .executeTakeFirst();
  await db.deleteFrom("marketing_metric_coverage").where("date", "<", beforeDate).execute();
  const runs = await db
    .deleteFrom("marketing_sync_runs")
    .where("startedAt", "<", runsBefore)
    .executeTakeFirst();
  return {
    facts: Number(facts.numDeletedRows ?? 0),
    runs: Number(runs.numDeletedRows ?? 0),
  };
}
