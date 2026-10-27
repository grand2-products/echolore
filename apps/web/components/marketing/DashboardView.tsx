"use client";

import {
  MARKETING_DATE_RANGES,
  type MarketingDashboardDto,
  type MarketingDateRange,
  type MarketingWidgetDto,
} from "@echolore/shared/contracts";
import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
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
import { inputClass, panelClass, WikiLink } from "./ui";

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
  const title = widget.title.trim();
  const hasHeader = title.length > 0 || Boolean(widget.wikiPageId);
  return (
    <section className={`min-w-0 bg-white ${SPAN[widget.width] ?? SPAN[1]}`}>
      {hasHeader ? (
        <header className="flex items-center justify-between gap-2 px-3 pt-2">
          {title ? <h3 className="truncate text-xs text-gray-500">{title}</h3> : <span />}
          {/* 根拠への導線: every widget can point at its Wiki procedure / definition. */}
          <WikiLink pageId={widget.wikiPageId} label={t("marketing.widgets.evidence")} />
        </header>
      ) : null}
      <div className="px-3 py-3">
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
  showName = false,
}: {
  dashboard: Pick<
    MarketingDashboardDto,
    "name" | "description" | "widgets" | "defaultRange" | "wikiPageId"
  > &
    Partial<Pick<MarketingDashboardDto, "version" | "updatedAt" | "updatedByName">>;
  actions?: React.ReactNode;
  /** Record name. Off on the overview, where the board itself is the page. */
  showName?: boolean;
}) {
  const t = useT();
  const [range, setRange] = useState<MarketingDateRange>(dashboard.defaultRange);
  const window = useMemo(() => resolveDateRange(range), [range]);
  const compareWindow = useMemo(() => previousWindow(window), [window]);

  return (
    <div className={panelClass}>
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-b border-gray-200 px-3 py-2">
        {showName ? (
          <p className="mr-auto min-w-0 truncate text-sm text-gray-900">{dashboard.name}</p>
        ) : null}
        <span className="text-xs tabular-nums text-gray-500">
          {window.from} – {window.to}
        </span>
        <WikiLink pageId={dashboard.wikiPageId} label={t("marketing.dashboards.procedures")} />
        <DateRangeSelect value={range} onChange={setRange} />
        {actions}
      </div>
      {dashboard.widgets.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm text-gray-500">
          {t("marketing.dashboards.noWidgets")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-px bg-gray-200 md:grid-cols-3">
          {dashboard.widgets.map((w) => (
            <WidgetFrame key={w.id} widget={w} window={window} compareWindow={compareWindow} />
          ))}
        </div>
      )}
    </div>
  );
}
