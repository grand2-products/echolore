"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.floor(w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(value));
  const n = value / exp;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * exp;
}

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  /** One value per x (null = gap). */
  values: Array<number | null>;
}

const MARGIN = { top: 12, right: 12, bottom: 24, left: 52 };
const HEIGHT = 180;

/**
 * Line chart: 2px lines, hairline grid, one y-axis, crosshair tooltip.
 * Dates in `missing` are shaded and reported as 未取得 rather than drawn as zero.
 */
export function LineChart({
  dates,
  series,
  missing,
  formatValue,
  formatTick,
  formatDate,
}: {
  dates: string[];
  series: LineSeries[];
  missing: Set<string>;
  formatValue: (v: number | null) => string;
  formatTick: (v: number) => string;
  formatDate: (d: string) => string;
}) {
  const t = useT();
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const max = useMemo(
    () =>
      niceMax(
        Math.max(0, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)))
      ),
    [series]
  );
  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const step = dates.length > 1 ? plotW / (dates.length - 1) : 0;
  const x = (i: number) => MARGIN.left + (dates.length > 1 ? i * step : plotW / 2);
  const y = (v: number) => MARGIN.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(dates.length / Math.max(1, Math.floor(plotW / 70))));

  const paths = series.map((s) => {
    let d = "";
    let pen = false;
    s.values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return { key: s.key, color: s.color, d };
  });

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = dates.length > 1 ? Math.round(px / step) : 0;
    setHover(Math.min(dates.length - 1, Math.max(0, i)));
  };

  const hoverDate = hover !== null ? dates[hover] : undefined;

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 ? (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={series.map((s) => s.label).join(", ")}
        >
          {dates.map((d, i) =>
            missing.has(d) ? (
              <rect
                key={`m-${d}`}
                x={x(i) - Math.max(step, 4) / 2}
                y={MARGIN.top}
                width={Math.max(step, 4)}
                height={plotH}
                fill="#f1f0ec"
              />
            ) : null
          )}
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + plotW}
                y1={y(tick)}
                y2={y(tick)}
                stroke="#e7e6e2"
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 6}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                fill="#6b6a66"
              >
                {formatTick(tick)}
              </text>
            </g>
          ))}
          {dates.map((d, i) =>
            i % labelEvery === 0 ? (
              <text
                key={`x-${d}`}
                x={x(i)}
                y={HEIGHT - 6}
                textAnchor="middle"
                fontSize={11}
                fill="#6b6a66"
              >
                {formatDate(d)}
              </text>
            ) : null
          )}
          {paths.map((p) => (
            <path
              key={p.key}
              d={p.d}
              fill="none"
              stroke={p.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {hover !== null ? (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={MARGIN.top}
                y2={MARGIN.top + plotH}
                stroke="#b9b8b2"
                strokeWidth={1}
              />
              {series.map((s) => {
                const v = s.values[hover];
                return v === null || v === undefined ? null : (
                  <circle
                    key={s.key}
                    cx={x(hover)}
                    cy={y(v)}
                    r={4}
                    fill={s.color}
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                );
              })}
            </g>
          ) : null}
          {/* Pointer-only hover layer; keyboard and screen-reader users get the table view. */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: decorative hover target, data is also available as a table */}
          <rect
            x={MARGIN.left - 8}
            y={MARGIN.top}
            width={plotW + 16}
            height={plotH}
            fill="transparent"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          />
        </svg>
      ) : (
        <div style={{ height: HEIGHT }} />
      )}
      {hover !== null && hoverDate ? (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-[140px] rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: Math.min(Math.max(x(hover) + 10, 0), Math.max(0, width - 170)),
          }}
        >
          <div className="mb-1 font-medium text-gray-900">{formatDate(hoverDate)}</div>
          {missing.has(hoverDate) ? (
            <div className="text-amber-700">{t("marketing.common.notFetched")}</div>
          ) : null}
          {series.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-3 text-gray-700">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-3" style={{ backgroundColor: s.color }} />
                {s.label}
              </span>
              <span className="tabular-nums text-gray-900">
                {formatValue(s.values[hover] ?? null)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Legend({ items }: { items: Array<{ key: string; label: string; color: string }> }) {
  if (items.length < 2) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
      {items.map((item) => (
        <span key={item.key} className="flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-3.5 rounded"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** Ordinal ramp (blue 250 → 400 → 550) for ordered funnel stages. */
const STAGE_COLORS = ["#86b6ef", "#3987e5", "#1c5cab"];

export function FunnelBars({
  stages,
  formatValue,
  formatRate,
}: {
  stages: Array<{ key: string; label: string; value: number | null }>;
  formatValue: (v: number | null) => string;
  formatRate: (v: number | null) => string;
}) {
  const top = stages[0]?.value ?? 0;
  return (
    <div className="space-y-1.5">
      {stages.map((stage, i) => {
        const prev = i > 0 ? stages[i - 1]?.value : null;
        const rate = i > 0 && prev ? (stage.value ?? 0) / prev : null;
        const pct = top > 0 && stage.value !== null ? Math.max(0.5, (stage.value / top) * 100) : 0;
        return (
          <div
            key={stage.key}
            className="grid grid-cols-[96px_1fr_auto] items-center gap-2 text-xs"
          >
            <span className="truncate text-gray-600">{stage.label}</span>
            <div
              className="h-3 rounded-r bg-gray-50"
              title={`${stage.label}: ${formatValue(stage.value)}`}
            >
              <div
                className="h-3 rounded-r"
                style={{
                  width: `${pct}%`,
                  maxWidth: "100%",
                  backgroundColor: STAGE_COLORS[i] ?? STAGE_COLORS[2],
                }}
              />
            </div>
            <span className="whitespace-nowrap tabular-nums text-gray-800">
              {formatValue(stage.value)}
              {i > 0 ? <span className="ml-1.5 text-gray-500">({formatRate(rate)})</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
