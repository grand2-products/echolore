"use client";

import {
  MARKETING_DATE_RANGES,
  type MarketingDashboardDto,
  type MarketingDateRange,
  type MarketingWidgetDto,
} from "@echolore/shared/contracts";
import { useMemo, useState } from "react";
import { useFormatters, useT } from "@/lib/i18n";
import { type DateWindow, previousWindow, resolveDateRange } from "./format";
import { BreakdownWidget, FunnelWidget, KpiWidget, TimeseriesWidget } from "./metric-widgets";
import {
  AssetsWidget,
  ChangesWidget,
  FreshnessWidget,
  LinksWidget,
  NoteWidget,
  ReviewsWidget,
} from "./ops-widgets";
import { inputClass, WikiLink } from "./ui";

const SPAN: Record<1 | 2 | 3, string> = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3",
};

function WidgetBody({
  widget,
  window,
  compareWindow,
}: {
  widget: MarketingWidgetDto;
  window: DateWindow;
  compareWindow: DateWindow;
}) {
  switch (widget.type) {
    case "kpi":
      return <KpiWidget widget={widget} window={window} compareWindow={compareWindow} />;
    case "timeseries":
      return <TimeseriesWidget widget={widget} window={window} />;
    case "breakdown":
      return <BreakdownWidget widget={widget} window={window} />;
    case "funnel":
      return <FunnelWidget widget={widget} window={window} />;
    case "freshness":
      return <FreshnessWidget />;
    case "assets":
      return <AssetsWidget widget={widget} />;
    case "changes":
      return <ChangesWidget widget={widget} />;
    case "reviews":
      return <ReviewsWidget widget={widget} />;
    case "links":
      return <LinksWidget widget={widget} />;
    case "note":
      return <NoteWidget widget={widget} />;
  }
}

export function WidgetFrame({
  widget,
  window,
  compareWindow,
}: {
  widget: MarketingWidgetDto;
  window: DateWindow;
  compareWindow: DateWindow;
}) {
  const t = useT();
  return (
    <section
      className={`min-w-0 rounded-xl border border-gray-200 bg-white ${SPAN[widget.width] ?? SPAN[1]}`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
        <h3 className="truncate text-sm font-semibold text-gray-900">
          {widget.title || t(`marketing.widgetTypes.${widget.type}`)}
        </h3>
        {/* 根拠への導線: every widget can point at its Wiki procedure / definition. */}
        <WikiLink pageId={widget.wikiPageId} label={t("marketing.widgets.evidence")} />
      </header>
      <div className="p-4">
        <WidgetBody widget={widget} window={window} compareWindow={compareWindow} />
      </div>
    </section>
  );
}

export function DateRangeSelect({
  value,
  onChange,
}: {
  value: MarketingDateRange;
  onChange: (value: MarketingDateRange) => void;
}) {
  const t = useT();
  return (
    <select
      className={`${inputClass} w-auto`}
      value={value}
      onChange={(e) => onChange(e.target.value as MarketingDateRange)}
      aria-label={t("marketing.dashboards.range")}
    >
      {MARKETING_DATE_RANGES.map((r) => (
        <option key={r} value={r}>
          {t(`marketing.ranges.${r}`)}
        </option>
      ))}
    </select>
  );
}

/** Renders a dashboard definition with one shared date range (filters sit above the grid). */
export function DashboardView({
  dashboard,
  actions,
}: {
  dashboard: Pick<
    MarketingDashboardDto,
    "name" | "description" | "widgets" | "defaultRange" | "wikiPageId"
  > &
    Partial<Pick<MarketingDashboardDto, "version" | "updatedAt" | "updatedByName">>;
  actions?: React.ReactNode;
}) {
  const t = useT();
  const { dateTime } = useFormatters();
  const [range, setRange] = useState<MarketingDateRange>(dashboard.defaultRange);
  const window = useMemo(() => resolveDateRange(range), [range]);
  const compareWindow = useMemo(() => previousWindow(window), [window]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-gray-900">{dashboard.name}</h2>
          {dashboard.description ? (
            <p className="mt-0.5 text-sm text-gray-600">{dashboard.description}</p>
          ) : null}
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-gray-500">
            {dashboard.version ? (
              <span>
                {t("marketing.dashboards.release", { version: dashboard.version })}
                {dashboard.updatedAt ? ` · ${dateTime(dashboard.updatedAt)}` : ""}
                {dashboard.updatedByName ? ` · ${dashboard.updatedByName}` : ""}
              </span>
            ) : null}
            <span>
              {t("marketing.dashboards.period")}: {window.from} – {window.to}
            </span>
            <WikiLink pageId={dashboard.wikiPageId} label={t("marketing.dashboards.procedures")} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeSelect value={range} onChange={setRange} />
          {actions}
        </div>
      </div>
      {dashboard.widgets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          {t("marketing.dashboards.noWidgets")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {dashboard.widgets.map((w) => (
            <WidgetFrame key={w.id} widget={w} window={window} compareWindow={compareWindow} />
          ))}
        </div>
      )}
    </div>
  );
}
