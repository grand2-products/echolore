"use client";

import {
  isSummableAcrossSources,
  MARKETING_METRIC_MAP,
  type MarketingCoverageDto,
  type MarketingDimension,
  type MarketingMetricsQueryRequest,
  type MarketingMetricsQueryResponse,
  type MarketingMetricsRowDto,
  type MarketingWidgetDto,
} from "@echolore/shared/contracts";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { marketingApi, queryKeys } from "@/lib/api";
import { useFormatters, useT } from "@/lib/i18n";
import { FunnelBars, Legend, LineChart, type LineSeries } from "./charts";
import {
  type DateWindow,
  metricHigherIsBetter,
  SINGLE_SERIES_COLOR,
  shiftDate,
  sourceColor,
  useMarketingFormat,
} from "./format";
import { StatusDot } from "./ui";

export function useMetricsQuery(req: MarketingMetricsQueryRequest | null) {
  return useQuery({
    queryKey: [...queryKeys.marketing, "metrics", req],
    queryFn: () => marketingApi.queryMetrics(req as MarketingMetricsQueryRequest),
    enabled: Boolean(req),
    staleTime: 60_000,
  });
}

function enumerate(window: DateWindow): string[] {
  const out: string[] = [];
  for (let d = window.from; d <= window.to && out.length < 400; d = shiftDate(d, 1)) out.push(d);
  return out;
}

function missingUnion(coverage: MarketingCoverageDto[]): Set<string> {
  return new Set(coverage.flatMap((c) => c.missingDates));
}

/** Stale sources and unfetched days, stated explicitly under each data widget. */
export function CoverageNote({ coverage }: { coverage: MarketingCoverageDto[] | undefined }) {
  const t = useT();
  const { dateTime } = useFormatters();
  if (!coverage) return null;
  if (coverage.length === 0) {
    return <p className="mt-2 text-xs text-gray-500">{t("marketing.coverage.noSource")}</p>;
  }
  const stale = coverage.filter((c) => c.stale);
  const missing = coverage.filter((c) => c.missingDates.length > 0);
  if (stale.length === 0 && missing.length === 0) return null;
  return (
    <div className="mt-2 space-y-0.5 text-xs text-amber-800">
      {stale.map((c) => (
        <p key={`s-${c.connectorId}`} className="flex items-start gap-1.5">
          <StatusDot />
          {t("marketing.coverage.stale", {
            name: c.connectorName,
            at: c.lastSuccessAt ? dateTime(c.lastSuccessAt) : t("marketing.common.never"),
          })}
        </p>
      ))}
      {missing.map((c) => (
        <p key={`m-${c.connectorId}`}>
          {t("marketing.coverage.missing", {
            name: c.connectorName,
            count: c.missingDates.length,
            dates: c.missingDates.slice(-3).join(", "),
          })}
        </p>
      ))}
    </div>
  );
}

function rowLabel(
  row: MarketingMetricsRowDto,
  dims: MarketingDimension[],
  sourceLabel: (s: string) => string,
  showCurrency: boolean
): string {
  const parts = dims.map((d) => {
    if (d === "source") return sourceLabel(row.dims.source ?? "");
    if (d === "campaign") return row.dims.campaignName || row.dims.campaign || "—";
    if (d === "connector") return row.dims.connectorName || row.dims.connector || "—";
    return row.dims[d] || "—";
  });
  if (showCurrency && row.currency) parts.push(row.currency);
  return parts.join(" / ");
}

// ─── KPI ─────────────────────────────────────────────────────────

function KpiTile({
  metric,
  window,
  compareWindow,
  filters,
}: {
  metric: string;
  window: DateWindow;
  compareWindow: DateWindow | null;
  filters: MarketingWidgetDto["filters"];
}) {
  const t = useT();
  const { metricLabel, formatMetric, sourceLabel } = useMarketingFormat();
  const current = useMetricsQuery({ ...window, metrics: [metric], filters });
  const previous = useMetricsQuery(
    compareWindow ? { ...compareWindow, metrics: [metric], filters } : null
  );
  const data = current.data;

  const body = (() => {
    if (current.isLoading)
      return <p className="mt-1 text-[1.75rem] font-semibold leading-none text-gray-300">…</p>;
    if (current.error || !data)
      return <p className="mt-2 text-sm text-red-600">{t("marketing.common.loadFailed")}</p>;
    if (data.coverage.length === 0) {
      return <p className="mt-2 text-sm text-gray-500">{t("marketing.coverage.noSource")}</p>;
    }
    const anyMissing = data.coverage.some((c) => c.missingDates.length > 0);
    if (data.rows.length === 0) {
      const isBase = MARKETING_METRIC_MAP[metric]?.kind === "base";
      return (
        <p className="mt-1 text-[1.75rem] font-semibold leading-none tracking-tight text-gray-900">
          {anyMissing ? (
            <span className="text-base text-amber-700">{t("marketing.common.notFetched")}</span>
          ) : isBase ? (
            formatMetric(metric, 0, null)
          ) : (
            <span className="text-base text-gray-500">{t("marketing.common.notComputable")}</span>
          )}
        </p>
      );
    }
    const multi = data.rows.length > 1;
    const prevRows = previous.data?.rows ?? [];
    return (
      <div className="mt-1.5 space-y-1">
        {data.rows.map((row) => {
          const value = row.values[metric] ?? null;
          const match = prevRows.find(
            (p) => p.dims.source === row.dims.source && p.currency === row.currency
          );
          const prev = match?.values[metric] ?? null;
          const delta =
            compareWindow && value !== null && prev ? (value - prev) / Math.abs(prev) : null;
          const good = delta !== null && delta >= 0 === metricHigherIsBetter(metric);
          return (
            <div
              key={`${row.dims.source ?? ""}-${row.currency ?? ""}`}
              className="flex flex-wrap items-baseline gap-x-2"
            >
              {multi ? (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  {row.dims.source ? (
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: sourceColor(row.dims.source) }}
                    />
                  ) : null}
                  {row.dims.source ? sourceLabel(row.dims.source) : row.currency}
                </span>
              ) : null}
              <span
                className={`${multi ? "text-lg" : "text-[1.75rem] leading-none tracking-tight"} font-semibold tabular-nums text-gray-900`}
              >
                {formatMetric(metric, value, row.currency)}
              </span>
              {delta !== null && Number.isFinite(delta) ? (
                <span
                  className={`text-xs tabular-nums ${good ? "text-emerald-700" : "text-red-700"}`}
                >
                  {delta >= 0 ? "▲" : "▼"} {Math.abs(delta * 100).toFixed(1)}%
                </span>
              ) : null}
            </div>
          );
        })}
        {anyMissing ? (
          <p className="text-xs text-amber-700">{t("marketing.coverage.partial")}</p>
        ) : null}
      </div>
    );
  })();

  return (
    <div className="min-w-0 bg-white px-3 py-2.5">
      <p className="text-[11px] leading-4 text-gray-500">
        {metricLabel(metric)}
        {!isSummableAcrossSources(metric) ? (
          <span className="ml-1 text-[11px] text-gray-400">{t("marketing.kpi.perSource")}</span>
        ) : null}
      </p>
      {body}
      {compareWindow ? (
        <p className="mt-1 text-[11px] text-gray-400">{t("marketing.kpi.vsPrevious")}</p>
      ) : null}
    </div>
  );
}

export function KpiWidget({
  widget,
  window,
  compareWindow,
}: {
  widget: MarketingWidgetDto;
  window: DateWindow;
  compareWindow: DateWindow | null;
}) {
  const metrics = widget.metrics?.length ? widget.metrics : ["cost"];
  return (
    <div className="-mx-3 -my-3 grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-px bg-gray-200">
      {metrics.map((m) => (
        <KpiTile
          key={m}
          metric={m}
          window={window}
          compareWindow={widget.compare ? compareWindow : null}
          filters={widget.filters}
        />
      ))}
    </div>
  );
}

// ─── Time series (one chart per metric — never a second y-axis) ─

function MetricSeriesChart({
  metric,
  window,
  filters,
  showTable,
}: {
  metric: string;
  window: DateWindow;
  filters: MarketingWidgetDto["filters"];
  showTable: boolean;
}) {
  const t = useT();
  const { metricLabel, formatMetric, sourceLabel } = useMarketingFormat();
  const query = useMetricsQuery({ ...window, metrics: [metric], dimensions: ["date"], filters });
  const data = query.data;
  const dates = useMemo(() => enumerate(window), [window]);

  const { series, missing } = useMemo(() => {
    if (!data) return { series: [] as LineSeries[], missing: new Set<string>() };
    const missingSet = missingUnion(data.coverage);
    const isBase = MARKETING_METRIC_MAP[metric]?.kind === "base";
    const groups = new Map<string, Map<string, number | null>>();
    for (const row of data.rows) {
      const key = [
        data.splitBySource ? row.dims.source : "",
        data.splitByCurrency ? row.currency : "",
      ].join("|");
      const map = groups.get(key) ?? new Map();
      map.set(row.dims.date ?? "", row.values[metric] ?? null);
      groups.set(key, map);
    }
    if (groups.size === 0) groups.set("|", new Map());
    const out: LineSeries[] = [...groups.entries()].map(([key, byDate]) => {
      const [source, currency] = key.split("|");
      const labelParts = [source ? sourceLabel(source) : metricLabel(metric), currency].filter(
        Boolean
      );
      return {
        key,
        label: labelParts.join(" / "),
        color: source ? sourceColor(source) : SINGLE_SERIES_COLOR,
        values: dates.map((d) => {
          if (byDate.has(d)) return byDate.get(d) ?? null;
          // No row: zero only when the day was actually fetched (未取得 ≠ 0).
          return missingSet.has(d) || !isBase ? null : 0;
        }),
      };
    });
    return { series: out, missing: missingSet };
  }, [data, dates, metric, metricLabel, sourceLabel]);

  const currency = data?.rows.find((r) => r.currency)?.currency ?? null;

  return (
    <div>
      <p className="mb-1 text-xs font-medium text-gray-600">{metricLabel(metric)}</p>
      {query.isLoading ? (
        <div className="h-[180px] animate-pulse rounded bg-gray-50" />
      ) : query.error || !data ? (
        <p className="text-sm text-red-600">{t("marketing.common.loadFailed")}</p>
      ) : showTable ? (
        <div className="max-h-[220px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white text-gray-500">
              <tr>
                <th className="py-1 text-left font-medium">{t("marketing.dimensions.date")}</th>
                {series.map((s) => (
                  <th key={s.key} className="py-1 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((d, i) => (
                <tr key={d} className="border-t border-gray-100">
                  <td className="py-1 text-gray-700">
                    {d}
                    {missing.has(d) ? (
                      <span className="ml-1 text-amber-700">
                        ({t("marketing.common.notFetched")})
                      </span>
                    ) : null}
                  </td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1 text-right tabular-nums text-gray-900">
                      {s.values[i] === null
                        ? "—"
                        : formatMetric(metric, s.values[i] ?? null, currency)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <Legend items={series} />
          <LineChart
            dates={dates}
            series={series}
            missing={missing}
            formatValue={(v) => (v === null ? "—" : formatMetric(metric, v, currency))}
            formatTick={(v) => formatMetric(metric, v, currency, true)}
            formatDate={(d) => d.slice(5).replace("-", "/")}
          />
        </>
      )}
      <CoverageNote coverage={data?.coverage} />
    </div>
  );
}

export function TimeseriesWidget({
  widget,
  window,
}: {
  widget: MarketingWidgetDto;
  window: DateWindow;
}) {
  const t = useT();
  const [showTable, setShowTable] = useState(false);
  const metrics = widget.metrics?.length ? widget.metrics : ["cost"];
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          className="text-xs text-blue-600 hover:underline"
          onClick={() => setShowTable((v) => !v)}
        >
          {showTable ? t("marketing.widgets.showChart") : t("marketing.widgets.showTable")}
        </button>
      </div>
      <div className={`grid gap-4 ${metrics.length > 1 ? "lg:grid-cols-2" : ""}`}>
        {metrics.map((m) => (
          <MetricSeriesChart
            key={m}
            metric={m}
            window={window}
            filters={widget.filters}
            showTable={showTable}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Breakdown table ─────────────────────────────────────────────

export function BreakdownTable({
  data,
  metrics,
}: {
  data: MarketingMetricsQueryResponse;
  metrics: string[];
}) {
  const t = useT();
  const { metricLabel, formatMetric, sourceLabel } = useMarketingFormat();
  if (data.rows.length === 0) {
    return <p className="py-4 text-center text-sm text-gray-500">{t("marketing.common.noData")}</p>;
  }
  const dims = data.dimensions;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-gray-500">
          <tr className="border-b border-gray-100">
            <th className="py-2 pr-3 text-left font-medium">
              {dims.map((d) => t(`marketing.dimensions.${d}`)).join(" / ")}
            </th>
            {metrics.map((m) => (
              <th key={m} className="whitespace-nowrap py-2 pl-3 text-right font-medium">
                {metricLabel(m)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id; order is fixed per response
            <tr key={i} className="border-b border-gray-50 last:border-0">
              <td
                className="max-w-[320px] truncate py-1.5 pr-3 text-gray-800"
                title={rowLabel(row, dims, sourceLabel, data.splitByCurrency)}
              >
                {row.dims.source && dims.includes("source") ? (
                  <span
                    className="mr-1.5 inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: sourceColor(row.dims.source) }}
                  />
                ) : null}
                {rowLabel(row, dims, sourceLabel, data.splitByCurrency)}
              </td>
              {metrics.map((m) => (
                <td
                  key={m}
                  className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums text-gray-900"
                >
                  {formatMetric(m, row.values[m] ?? null, row.currency)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BreakdownWidget({
  widget,
  window,
}: {
  widget: MarketingWidgetDto;
  window: DateWindow;
}) {
  const t = useT();
  const metrics = widget.metrics?.length ? widget.metrics : ["cost"];
  const query = useMetricsQuery({
    ...window,
    metrics,
    dimensions: [widget.dimension ?? "campaign"],
    filters: widget.filters,
    sortBy: metrics[0],
    sortDir: "desc",
    limit: widget.limit ?? 20,
  });
  if (query.isLoading) return <div className="h-24 animate-pulse rounded bg-gray-50" />;
  if (query.error || !query.data)
    return <p className="text-sm text-red-600">{t("marketing.common.loadFailed")}</p>;
  return (
    <>
      <BreakdownTable data={query.data} metrics={metrics} />
      <CoverageNote coverage={query.data.coverage} />
    </>
  );
}

// ─── LP funnel ───────────────────────────────────────────────────

export function FunnelWidget({
  widget,
  window,
}: {
  widget: MarketingWidgetDto;
  window: DateWindow;
}) {
  const t = useT();
  const { metricLabel, formatMetric } = useMarketingFormat();
  const stages = widget.metrics?.length
    ? widget.metrics
    : ["lp_views", "form_starts", "form_submits"];
  const filters = widget.filters ?? { sources: ["ga4"] };
  const query = useMetricsQuery({
    ...window,
    metrics: stages,
    dimensions: ["segment"],
    filters,
    sortBy: stages[0],
    sortDir: "desc",
    limit: widget.limit ?? 10,
  });
  if (query.isLoading) return <div className="h-24 animate-pulse rounded bg-gray-50" />;
  if (query.error || !query.data)
    return <p className="text-sm text-red-600">{t("marketing.common.loadFailed")}</p>;
  const rows = query.data.rows;
  return (
    <div>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">{t("marketing.common.noData")}</p>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <div key={row.dims.segment ?? ""}>
              <p
                className="mb-1 truncate text-xs font-medium text-gray-800"
                title={row.dims.segment}
              >
                {row.dims.segment || "—"}
              </p>
              <FunnelBars
                stages={stages.map((s) => ({
                  key: s,
                  label: metricLabel(s),
                  value: row.values[s] ?? null,
                }))}
                formatValue={(v) => (v === null ? "—" : formatMetric("form_starts", v, null))}
                formatRate={(v) => formatMetric("cvr", v, null)}
              />
            </div>
          ))}
        </div>
      )}
      <CoverageNote coverage={query.data.coverage} />
    </div>
  );
}
