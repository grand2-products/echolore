import type { MarketingDimension } from "@echolore/shared/contracts";
import { type SelectQueryBuilder, sql } from "kysely";
import { db } from "../../db/index.js";
import type { Database } from "../../db/schema.js";

const DIMENSION_COLUMNS = {
  date: "date",
  source: "source",
  connector: "connectorId",
  account: "accountId",
  campaign: "campaignId",
  segment: "segment",
} as const satisfies Record<MarketingDimension, keyof Database["marketing_metrics_daily"]>;

export interface FactFilters {
  from: string;
  to: string;
  metrics: string[];
  connectorIds: string[];
  sources?: string[];
  accountIds?: string[];
  campaignIds?: string[];
  segments?: string[];
}

export interface AggregatedFact {
  dims: Partial<Record<MarketingDimension, string>>;
  campaignName: string | null;
  currency: string | null;
  metric: string;
  value: number;
}

type FactQuery = SelectQueryBuilder<Database, "marketing_metrics_daily", object>;

function applyFilters(query: FactQuery, f: FactFilters): FactQuery {
  let q = query
    .where("date", ">=", f.from)
    .where("date", "<=", f.to)
    .where("metric", "in", f.metrics)
    .where("connectorId", "in", f.connectorIds);
  if (f.sources?.length) q = q.where("source", "in", f.sources);
  if (f.accountIds?.length) q = q.where("accountId", "in", f.accountIds);
  if (f.campaignIds?.length) q = q.where("campaignId", "in", f.campaignIds);
  if (f.segments?.length) q = q.where("segment", "in", f.segments);
  return q;
}

/** Distinct currencies among the matched facts of the given metrics. */
export async function listCurrencies(f: FactFilters): Promise<string[]> {
  if (f.connectorIds.length === 0 || f.metrics.length === 0) return [];
  const rows = await applyFilters(db.selectFrom("marketing_metrics_daily"), f)
    .select("currency")
    .distinct()
    .where("currency", "is not", null)
    .execute();
  return rows.map((r) => r.currency).filter((c): c is string => Boolean(c));
}

/** SUM(value) of base metrics grouped by the requested dimensions (and currency). */
export async function aggregateFacts(
  f: FactFilters,
  dimensions: MarketingDimension[],
  splitByCurrency: boolean
): Promise<AggregatedFact[]> {
  if (f.connectorIds.length === 0 || f.metrics.length === 0) return [];
  const dimCols = dimensions.map((d) => DIMENSION_COLUMNS[d]);
  const groupCols = [
    ...dimCols,
    "metric" as const,
    ...(splitByCurrency ? (["currency"] as const) : []),
  ];

  const rows = await applyFilters(db.selectFrom("marketing_metrics_daily"), f)
    .select((eb) => [
      ...groupCols.map((c) => eb.ref(c).as(c)),
      eb.fn.sum<string>("value").as("total"),
      eb.fn.max("campaignName").as("campaignName"),
      ...(splitByCurrency ? [] : [eb.fn.max("currency").as("anyCurrency")]),
    ])
    .groupBy(groupCols)
    .execute();

  return rows.map((raw) => {
    const row = raw as Record<string, unknown>;
    const dims: Partial<Record<MarketingDimension, string>> = {};
    for (const d of dimensions) dims[d] = String(row[DIMENSION_COLUMNS[d]] ?? "");
    return {
      dims,
      campaignName: (row.campaignName as string | null) ?? null,
      currency: ((splitByCurrency ? row.currency : row.anyCurrency) as string | null) ?? null,
      metric: String(row.metric),
      value: Number(row.total),
    };
  });
}

/** Sum of one metric for one connector over a period (reconciliation's system value). */
export async function sumMetricForConnector(
  connectorId: string,
  metric: string,
  from: string,
  to: string
): Promise<number> {
  const row = await db
    .selectFrom("marketing_metrics_daily")
    .select(sql<string>`coalesce(sum(value), 0)`.as("total"))
    .where("connectorId", "=", connectorId)
    .where("metric", "=", metric)
    .where("date", ">=", from)
    .where("date", "<=", to)
    .executeTakeFirst();
  return Number(row?.total ?? 0);
}

/** Connectors (among `connectorIds`) that have ever stored one of `metrics`. */
export async function listConnectorsHavingMetrics(
  connectorIds: string[],
  metrics: string[]
): Promise<Set<string>> {
  if (connectorIds.length === 0 || metrics.length === 0) return new Set();
  const rows = await db
    .selectFrom("marketing_metrics_daily")
    .select("connectorId")
    .distinct()
    .where("connectorId", "in", connectorIds)
    .where("metric", "in", metrics)
    .execute();
  return new Set(rows.map((r) => r.connectorId));
}
