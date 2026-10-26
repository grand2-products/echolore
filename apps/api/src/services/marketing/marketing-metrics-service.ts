import {
  isSummableAcrossSources,
  MARKETING_METRIC_MAP,
  type MarketingCoverageDto,
  type MarketingDimension,
  type MarketingMetricsQueryRequest,
  type MarketingMetricsQueryResponse,
  type MarketingMetricsRowDto,
  marketingMetricComponents,
} from "@echolore/shared/contracts";
import type { MarketingConnector } from "../../db/schema.js";
import {
  listConnectors,
  listCoveredDates,
} from "../../repositories/marketing/marketing-connector-repository.js";
import {
  type AggregatedFact,
  aggregateFacts,
  listConnectorsHavingMetrics,
  listCurrencies,
} from "../../repositories/marketing/marketing-metrics-repository.js";
import { getConnectorDefinition } from "./connectors/registry.js";
import {
  addDays,
  daysBetweenInclusive,
  enumerateDates,
  isIsoDate,
  todayInTimezone,
} from "./marketing-dates.js";
import { getMarketingSettings } from "./marketing-settings-service.js";

export const MAX_QUERY_DAYS = 400;
const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 5000;

export class MetricsQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetricsQueryError";
  }
}

export function isConnectorStale(
  connector: Pick<MarketingConnector, "enabled" | "type" | "lastSuccessAt">,
  staleAfterHours: number,
  now = new Date()
): boolean {
  if (!connector.enabled) return false;
  if (!getConnectorDefinition(connector.type)?.supportsSync) return false;
  if (!connector.lastSuccessAt) return true;
  return now.getTime() - connector.lastSuccessAt.getTime() > staleAfterHours * 3_600_000;
}

/**
 * Derived metrics are ratios of sums, never averages of ratios.
 * A zero or missing denominator yields null (算定不可).
 */
export function computeMetricValue(metric: string, sums: Map<string, number>): number | null {
  const def = MARKETING_METRIC_MAP[metric];
  if (!def) return null;
  if (def.kind === "base") return sums.has(metric) ? (sums.get(metric) ?? null) : null;
  const num = def.numerator ? sums.get(def.numerator) : undefined;
  const den = def.denominator ? sums.get(def.denominator) : undefined;
  if (num === undefined || den === undefined || den === 0) return null;
  return num / den;
}

export function pivotFacts(
  facts: AggregatedFact[],
  metrics: string[],
  dimensions: MarketingDimension[],
  splitByCurrency: boolean,
  fallbackCurrency: string | null,
  connectorNames: Map<string, string>
): MarketingMetricsRowDto[] {
  const groups = new Map<
    string,
    { dims: MarketingMetricsRowDto["dims"]; currency: string | null; sums: Map<string, number> }
  >();
  for (const fact of facts) {
    const currency = splitByCurrency ? fact.currency : fallbackCurrency;
    const key = JSON.stringify([
      dimensions.map((d) => fact.dims[d] ?? ""),
      splitByCurrency ? currency : null,
    ]);
    let group = groups.get(key);
    if (!group) {
      const dims: MarketingMetricsRowDto["dims"] = { ...fact.dims };
      if (dimensions.includes("campaign"))
        dims.campaignName = fact.campaignName ?? fact.dims.campaign ?? "";
      if (dimensions.includes("connector")) {
        dims.connectorName =
          connectorNames.get(fact.dims.connector ?? "") ?? fact.dims.connector ?? "";
      }
      group = { dims, currency, sums: new Map() };
      groups.set(key, group);
    }
    group.sums.set(fact.metric, (group.sums.get(fact.metric) ?? 0) + fact.value);
    if (dimensions.includes("campaign") && fact.campaignName)
      group.dims.campaignName = fact.campaignName;
  }
  return [...groups.values()].map((g) => ({
    dims: g.dims,
    currency: g.currency,
    values: Object.fromEntries(metrics.map((m) => [m, computeMetricValue(m, g.sums)])),
  }));
}

function sortRows(
  rows: MarketingMetricsRowDto[],
  dimensions: MarketingDimension[],
  sortBy: string | undefined,
  sortDir: "asc" | "desc"
) {
  const dir = sortDir === "asc" ? 1 : -1;
  if (sortBy && MARKETING_METRIC_MAP[sortBy]) {
    rows.sort((a, b) => {
      const av = a.values[sortBy];
      const bv = b.values[sortBy];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });
  } else if (dimensions.includes("date")) {
    rows.sort((a, b) => (a.dims.date ?? "").localeCompare(b.dims.date ?? ""));
  }
}

/**
 * Connectors whose data (and coverage) matter for the requested metrics.
 * A CSV connector can carry any metric, so it counts only once it has
 * actually imported one of them — otherwise an unrelated CSV source would
 * mark every metric as partially 未取得.
 */
async function relevantConnectors(
  connectors: MarketingConnector[],
  baseMetrics: string[],
  req: MarketingMetricsQueryRequest
): Promise<MarketingConnector[]> {
  const f = req.filters ?? {};
  const candidates = connectors.filter((c) => {
    if (f.connectorIds?.length && !f.connectorIds.includes(c.id)) return false;
    if (f.sources?.length && !f.sources.includes(c.type as never)) return false;
    const produced = getConnectorDefinition(c.type)?.metrics ?? [];
    return baseMetrics.some((m) => produced.includes(m));
  });
  const csvIds = candidates.filter((c) => c.type === "csv").map((c) => c.id);
  if (csvIds.length === 0) return candidates;
  const withData = await listConnectorsHavingMetrics(csvIds, baseMetrics);
  return candidates.filter((c) => c.type !== "csv" || withData.has(c.id));
}

async function buildCoverage(
  connectors: MarketingConnector[],
  from: string,
  to: string,
  staleAfterHours: number
): Promise<MarketingCoverageDto[]> {
  const covered = await listCoveredDates(
    connectors.map((c) => c.id),
    from,
    to
  );
  const byConnector = new Map<string, Set<string>>();
  for (const row of covered) {
    let set = byConnector.get(row.connectorId);
    if (!set) {
      set = new Set();
      byConnector.set(row.connectorId, set);
    }
    set.add(row.date);
  }
  return connectors.map((c) => {
    // Only dates a run could already have covered count as missing: API sources
    // fetch through yesterday, health checks through today.
    const today = todayInTimezone(c.timezone);
    const expectedEnd =
      getConnectorDefinition(c.type)?.resolveRange?.(today, 1).to ?? addDays(today, -1);
    const end = to < expectedEnd ? to : expectedEnd;
    const set = byConnector.get(c.id) ?? new Set<string>();
    const missingDates = from <= end ? enumerateDates(from, end).filter((d) => !set.has(d)) : [];
    return {
      connectorId: c.id,
      connectorName: c.name,
      type: c.type as MarketingCoverageDto["type"],
      lastSuccessAt: c.lastSuccessAt?.toISOString() ?? null,
      stale: isConnectorStale(c, staleAfterHours),
      missingDates,
    };
  });
}

export async function queryMarketingMetrics(
  req: MarketingMetricsQueryRequest
): Promise<MarketingMetricsQueryResponse> {
  if (!isIsoDate(req.from) || !isIsoDate(req.to) || req.from > req.to) {
    throw new MetricsQueryError("from/to must be valid dates with from <= to");
  }
  if (daysBetweenInclusive(req.from, req.to) > MAX_QUERY_DAYS) {
    throw new MetricsQueryError(`Range must be at most ${MAX_QUERY_DAYS} days`);
  }
  const unknown = req.metrics.filter((m) => !MARKETING_METRIC_MAP[m]);
  if (unknown.length > 0) throw new MetricsQueryError(`Unknown metrics: ${unknown.join(", ")}`);

  const dimensions: MarketingDimension[] = [...new Set(req.dimensions ?? [])];
  // Media CVs etc. are never added across sources (単純合算は行わない).
  const splitBySource =
    req.metrics.some((m) => !isSummableAcrossSources(m)) &&
    !dimensions.includes("source") &&
    !dimensions.includes("connector");
  if (splitBySource) dimensions.push("source");

  const baseMetrics = [...new Set(req.metrics.flatMap(marketingMetricComponents))];
  const [allConnectors, settings] = await Promise.all([listConnectors(), getMarketingSettings()]);
  const connectors = await relevantConnectors(allConnectors, baseMetrics, req);
  const filters = {
    from: req.from,
    to: req.to,
    metrics: baseMetrics,
    connectorIds: connectors.map((c) => c.id),
    sources: req.filters?.sources,
    accountIds: req.filters?.accountIds,
    campaignIds: req.filters?.campaignIds,
    segments: req.filters?.segments,
  };

  // Different currencies keep their original amounts (原額を保持); rows split by currency.
  const currencyMetrics = baseMetrics.filter((m) => MARKETING_METRIC_MAP[m]?.unit === "currency");
  const currencies =
    currencyMetrics.length > 0
      ? await listCurrencies({ ...filters, metrics: currencyMetrics })
      : [];
  const splitByCurrency = currencies.length > 1;

  const facts = await aggregateFacts(filters, dimensions, splitByCurrency);
  const connectorNames = new Map(allConnectors.map((c) => [c.id, c.name]));
  const rows = pivotFacts(
    facts,
    req.metrics,
    dimensions,
    splitByCurrency,
    currencies[0] ?? null,
    connectorNames
  );
  sortRows(rows, dimensions, req.sortBy, req.sortDir ?? "desc");
  const limit = Math.min(Math.max(req.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  return {
    from: req.from,
    to: req.to,
    metrics: req.metrics,
    dimensions,
    splitBySource,
    splitByCurrency,
    rows: rows.slice(0, limit),
    coverage: await buildCoverage(connectors, req.from, req.to, settings.staleAfterHours),
    generatedAt: new Date().toISOString(),
  };
}
