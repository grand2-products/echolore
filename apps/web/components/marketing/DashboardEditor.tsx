"use client";

import {
  MARKETING_CONNECTOR_TYPES,
  MARKETING_DATE_RANGES,
  MARKETING_DIMENSIONS,
  MARKETING_METRICS,
  MARKETING_WIDGET_TYPES,
  type MarketingConnectorType,
  type MarketingDashboardDefinition,
  type MarketingWidgetDto,
  type MarketingWidgetType,
} from "@echolore/shared/contracts";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useMarketingFormat } from "./format";
import { Button, Field, inputClass, WikiPageSelect } from "./ui";

const METRIC_WIDGETS = new Set<MarketingWidgetType>(["kpi", "timeseries", "breakdown", "funnel"]);
const DEFAULT_WIDTH: Record<MarketingWidgetType, 1 | 2 | 3> = {
  kpi: 3,
  timeseries: 2,
  breakdown: 3,
  funnel: 2,
  freshness: 1,
  assets: 1,
  changes: 1,
  reviews: 1,
  links: 1,
  note: 3,
};

export function newWidget(type: MarketingWidgetType): MarketingWidgetDto {
  const base: MarketingWidgetDto = {
    id: `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    type,
    title: "",
    width: DEFAULT_WIDTH[type],
  };
  if (type === "kpi") return { ...base, metrics: ["cost", "conversions", "cpa"], compare: true };
  if (type === "timeseries") return { ...base, metrics: ["cost"] };
  if (type === "breakdown")
    return {
      ...base,
      metrics: ["cost", "clicks", "conversions"],
      dimension: "campaign",
      limit: 20,
    };
  if (type === "funnel")
    return {
      ...base,
      metrics: ["lp_views", "form_starts", "form_submits"],
      filters: { sources: ["ga4"] },
      limit: 10,
    };
  if (type === "note") return { ...base, text: "" };
  if (type === "links") return { ...base, links: [] };
  return base;
}

function linksToText(widget: MarketingWidgetDto) {
  return (widget.links ?? []).map((l) => `${l.label} | ${l.url}`).join("\n");
}

function textToLinks(text: string) {
  return text
    .split("\n")
    .map((line) => line.split("|").map((p) => p.trim()))
    .filter(([label, url]) => label && url)
    .map(([label, url]) => ({ label: label as string, url: url as string }));
}

function WidgetForm({
  widget,
  onChange,
}: {
  widget: MarketingWidgetDto;
  onChange: (next: MarketingWidgetDto) => void;
}) {
  const t = useT();
  const { metricLabel } = useMarketingFormat();
  const [linksText, setLinksText] = useState(() => linksToText(widget));
  const set = (patch: Partial<MarketingWidgetDto>) => onChange({ ...widget, ...patch });
  const sources = widget.filters?.sources ?? [];
  const toggleSource = (s: MarketingConnectorType) => {
    const next = sources.includes(s) ? sources.filter((x) => x !== s) : [...sources, s];
    set({ filters: { ...widget.filters, sources: next.length ? next : undefined } });
  };
  const metrics = widget.metrics ?? [];
  const toggleMetric = (m: string) => {
    set({
      metrics: metrics.includes(m) ? metrics.filter((x) => x !== m) : [...metrics, m].slice(0, 10),
    });
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t("marketing.editor.widgetTitle")}>
        <input
          className={inputClass}
          value={widget.title}
          maxLength={200}
          onChange={(e) => set({ title: e.target.value })}
        />
      </Field>
      <Field label={t("marketing.editor.width")}>
        <select
          className={inputClass}
          value={widget.width}
          onChange={(e) => set({ width: Number(e.target.value) as 1 | 2 | 3 })}
        >
          {[1, 2, 3].map((w) => (
            <option key={w} value={w}>
              {t(`marketing.editor.width${w}`)}
            </option>
          ))}
        </select>
      </Field>

      {METRIC_WIDGETS.has(widget.type) ? (
        <div className="sm:col-span-2">
          <span className="mb-1 block text-sm font-medium text-gray-700">
            {t("marketing.editor.metrics")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {MARKETING_METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => toggleMetric(m.key)}
                aria-pressed={metrics.includes(m.key)}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  metrics.includes(m.key)
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {metrics.includes(m.key) ? `${metrics.indexOf(m.key) + 1}. ` : ""}
                {metricLabel(m.key)}
              </button>
            ))}
          </div>
          {widget.type === "funnel" ? (
            <p className="mt-1 text-xs text-gray-500">{t("marketing.editor.funnelHint")}</p>
          ) : null}
        </div>
      ) : null}

      {METRIC_WIDGETS.has(widget.type) ? (
        <div className="sm:col-span-2">
          <span className="mb-1 block text-sm font-medium text-gray-700">
            {t("marketing.editor.sources")}
          </span>
          <div className="flex flex-wrap gap-3">
            {MARKETING_CONNECTOR_TYPES.map((s) => (
              <label key={s} className="flex items-center gap-1.5 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={sources.includes(s)}
                  onChange={() => toggleSource(s)}
                />
                {t(`marketing.sources.${s}`)}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">{t("marketing.editor.sourcesHint")}</p>
        </div>
      ) : null}

      {widget.type === "breakdown" ? (
        <Field label={t("marketing.editor.dimension")}>
          <select
            className={inputClass}
            value={widget.dimension ?? "campaign"}
            onChange={(e) => set({ dimension: e.target.value as MarketingWidgetDto["dimension"] })}
          >
            {MARKETING_DIMENSIONS.map((d) => (
              <option key={d} value={d}>
                {t(`marketing.dimensions.${d}`)}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {widget.type === "kpi" ? (
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={Boolean(widget.compare)}
            onChange={(e) => set({ compare: e.target.checked })}
          />
          {t("marketing.editor.compare")}
        </label>
      ) : null}

      {["breakdown", "funnel", "changes", "reviews", "assets"].includes(widget.type) ? (
        <Field label={t("marketing.editor.limit")}>
          <input
            type="number"
            min={1}
            max={100}
            className={inputClass}
            value={widget.limit ?? ""}
            onChange={(e) => set({ limit: e.target.value ? Number(e.target.value) : undefined })}
          />
        </Field>
      ) : null}

      {widget.type === "note" ? (
        <div className="sm:col-span-2">
          <Field label={t("marketing.editor.text")}>
            <textarea
              className={inputClass}
              rows={4}
              maxLength={5000}
              value={widget.text ?? ""}
              onChange={(e) => set({ text: e.target.value })}
            />
          </Field>
        </div>
      ) : null}

      {widget.type === "links" ? (
        <div className="sm:col-span-2">
          <Field label={t("marketing.editor.links")} hint={t("marketing.editor.linksHint")}>
            <textarea
              className={`${inputClass} font-mono`}
              rows={4}
              value={linksText}
              onChange={(e) => {
                setLinksText(e.target.value);
                set({ links: textToLinks(e.target.value) });
              }}
            />
          </Field>
        </div>
      ) : null}

      <div className="sm:col-span-2">
        <Field label={t("marketing.editor.evidencePage")} hint={t("marketing.editor.evidenceHint")}>
          <WikiPageSelect value={widget.wikiPageId} onChange={(v) => set({ wikiPageId: v })} />
        </Field>
      </div>
    </div>
  );
}

export function DashboardEditor({
  draft,
  onChange,
}: {
  draft: MarketingDashboardDefinition;
  onChange: (next: MarketingDashboardDefinition) => void;
}) {
  const t = useT();
  const [addType, setAddType] = useState<MarketingWidgetType>("kpi");
  const [openId, setOpenId] = useState<string | null>(null);
  const setWidgets = (widgets: MarketingWidgetDto[]) => onChange({ ...draft, widgets });
  const move = (index: number, delta: number) => {
    const next = [...draft.widgets];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    if (item) next.splice(target, 0, item);
    setWidgets(next);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2">
        <Field label={t("marketing.editor.name")} required>
          <input
            className={inputClass}
            value={draft.name}
            maxLength={200}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field label={t("marketing.editor.defaultRange")}>
          <select
            className={inputClass}
            value={draft.defaultRange}
            onChange={(e) =>
              onChange({
                ...draft,
                defaultRange: e.target.value as MarketingDashboardDefinition["defaultRange"],
              })
            }
          >
            {MARKETING_DATE_RANGES.map((r) => (
              <option key={r} value={r}>
                {t(`marketing.ranges.${r}`)}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label={t("marketing.editor.description")}>
            <input
              className={inputClass}
              value={draft.description ?? ""}
              maxLength={2000}
              onChange={(e) => onChange({ ...draft, description: e.target.value || null })}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t("marketing.editor.procedurePage")}>
            <WikiPageSelect
              value={draft.wikiPageId}
              onChange={(v) => onChange({ ...draft, wikiPageId: v })}
            />
          </Field>
        </div>
      </div>

      <ol className="space-y-2">
        {draft.widgets.map((w, i) => (
          <li key={w.id} className="rounded-xl border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-sm font-medium text-gray-900"
                onClick={() => setOpenId(openId === w.id ? null : w.id)}
              >
                {i + 1}. {w.title || t(`marketing.widgetTypes.${w.type}`)}
                <span className="ml-2 text-xs font-normal text-gray-500">
                  {t(`marketing.widgetTypes.${w.type}`)} · {t(`marketing.editor.width${w.width}`)}
                </span>
              </button>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={t("marketing.editor.moveUp")}
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => move(i, 1)}
                  disabled={i === draft.widgets.length - 1}
                  aria-label={t("marketing.editor.moveDown")}
                >
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setOpenId(openId === w.id ? null : w.id)}
                >
                  {openId === w.id ? t("marketing.common.close") : t("marketing.common.edit")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600"
                  onClick={() => setWidgets(draft.widgets.filter((x) => x.id !== w.id))}
                >
                  {t("marketing.common.remove")}
                </Button>
              </div>
            </div>
            {openId === w.id ? (
              <div className="border-t border-gray-100 p-4">
                <WidgetForm
                  widget={w}
                  onChange={(next) =>
                    setWidgets(draft.widgets.map((x) => (x.id === w.id ? next : x)))
                  }
                />
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className={`${inputClass} w-auto`}
          value={addType}
          onChange={(e) => setAddType(e.target.value as MarketingWidgetType)}
        >
          {MARKETING_WIDGET_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`marketing.widgetTypes.${type}`)}
            </option>
          ))}
        </select>
        <Button
          onClick={() => {
            if (draft.widgets.length >= 30) return;
            const w = newWidget(addType);
            setWidgets([...draft.widgets, w]);
            setOpenId(w.id);
          }}
          disabled={draft.widgets.length >= 30}
        >
          + {t("marketing.editor.addWidget")}
        </Button>
      </div>
    </div>
  );
}
