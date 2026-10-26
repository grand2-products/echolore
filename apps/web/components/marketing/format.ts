"use client";

import {
  MARKETING_METRIC_MAP,
  type MarketingConnectorType,
  type MarketingDateRange,
} from "@echolore/shared/contracts";
import { useCallback, useMemo } from "react";
import { useLocale, useT } from "@/lib/i18n";

/**
 * Categorical colors follow the entity (the data source), never its rank,
 * so a filter that hides a source never repaints the others. Values are the
 * validated reference palette's light steps, assigned in its fixed order.
 */
export const SOURCE_COLORS: Record<MarketingConnectorType, string> = {
  meta_ads: "#2a78d6",
  google_ads: "#eb6834",
  ga4: "#1baf7a",
  lp_monitor: "#eda100",
  csv: "#e87ba4",
};
export const SINGLE_SERIES_COLOR = "#2a78d6";
export const OTHER_SERIES_COLOR = "#8a8984";

export function sourceColor(source: string | undefined): string {
  return SOURCE_COLORS[source as MarketingConnectorType] ?? OTHER_SERIES_COLOR;
}

// ─── Dates ────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}
export function daysInclusive(from: string, to: string): number {
  return (
    Math.round(
      (new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86_400_000
    ) + 1
  );
}

export interface DateWindow {
  from: string;
  to: string;
}

/** Rolling ranges end yesterday (complete days); calendar months use calendar bounds. */
export function resolveDateRange(range: MarketingDateRange, now = new Date()): DateWindow {
  const today = toIsoDate(now);
  const yesterday = shiftDate(today, -1);
  switch (range) {
    case "last_7_days":
      return { from: shiftDate(today, -7), to: yesterday };
    case "last_28_days":
      return { from: shiftDate(today, -28), to: yesterday };
    case "last_90_days":
      return { from: shiftDate(today, -90), to: yesterday };
    case "this_month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case "last_month": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toIsoDate(first), to: toIsoDate(last) };
    }
  }
}

/** The equally long period immediately before `window`. */
export function previousWindow(window: DateWindow): DateWindow {
  const len = daysInclusive(window.from, window.to);
  return { from: shiftDate(window.from, -len), to: shiftDate(window.from, -1) };
}

// ─── Metric formatting ───────────────────────────────────────────

export function useMarketingFormat() {
  const t = useT();
  const locale = useLocale();

  const metricLabel = useCallback(
    (key: string) => {
      const label = t(`marketing.metrics.${key}.label`);
      return label.startsWith("marketing.metrics.") ? key : label;
    },
    [t]
  );

  const formatters = useMemo(
    () => ({
      count: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
      compact: new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }),
      percent: new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }),
      ms: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
    }),
    [locale]
  );

  const formatMetric = useCallback(
    (key: string, value: number | null | undefined, currency?: string | null, compact = false) => {
      if (value === null || value === undefined || Number.isNaN(value)) {
        return t("marketing.common.notComputable");
      }
      const def = MARKETING_METRIC_MAP[key];
      switch (def?.unit) {
        case "currency":
          if (currency) {
            try {
              return new Intl.NumberFormat(locale, {
                style: "currency",
                currency,
                notation: compact ? "compact" : "standard",
                maximumFractionDigits: compact ? 1 : currency === "JPY" ? 0 : 2,
              }).format(value);
            } catch {
              // Unknown currency code: fall through to plain number.
            }
          }
          return (compact ? formatters.compact : formatters.count).format(value);
        case "ratio":
          return formatters.percent.format(value);
        case "ms":
          return `${formatters.ms.format(value)} ms`;
        default:
          return (compact ? formatters.compact : formatters.count).format(value);
      }
    },
    [formatters, locale, t]
  );

  const sourceLabel = useCallback((source: string) => t(`marketing.sources.${source}`), [t]);

  return { metricLabel, formatMetric, sourceLabel, locale };
}

export function metricHigherIsBetter(key: string): boolean {
  return MARKETING_METRIC_MAP[key]?.higherIsBetter ?? true;
}
