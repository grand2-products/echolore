"use client";

import type {
  CreateMarketingReconciliationRequest,
  MarketingConnectorTypeDto,
  MarketingReconciliationDto,
} from "@echolore/shared/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { shiftDate, toIsoDate, useMarketingFormat } from "@/components/marketing/format";
import { useConnectorsQuery } from "@/components/marketing/ops-widgets";
import {
  Button,
  EmptyState,
  Field,
  inputClass,
  Modal,
  Notice,
  PageHeader,
  Pill,
  useAction,
} from "@/components/marketing/ui";
import { ErrorBanner } from "@/components/ui";
import { marketingApi, queryKeys } from "@/lib/api";
import { useAuthContext } from "@/lib/auth-context";
import { useMarketingAccess } from "@/lib/hooks/use-marketing-access";
import { useFormatters, useT } from "@/lib/i18n";

const STATUS_TONE = { pending: "amber", approved: "green", rejected: "red" } as const;

function CreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const { metricLabel } = useMarketingFormat();
  const action = useAction();
  const connectors = useConnectorsQuery();
  const types = useQuery({
    queryKey: [...queryKeys.marketing, "connector-types"],
    queryFn: () => marketingApi.connectorTypes(),
  });
  const today = toIsoDate(new Date());
  // Default: the agreed comparison window of the last 7 complete days.
  const [form, setForm] = useState<CreateMarketingReconciliationRequest>({
    connectorId: "",
    metric: "cost",
    periodFrom: shiftDate(today, -7),
    periodTo: shiftDate(today, -1),
    sourceValue: 0,
    tolerancePct: 1,
  });
  const connector = connectors.data?.find((c) => c.id === form.connectorId);
  const metrics: string[] =
    types.data?.find((x: MarketingConnectorTypeDto) => x.type === connector?.type)?.metrics ?? [];
  const set = (patch: Partial<CreateMarketingReconciliationRequest>) =>
    setForm((f) => ({ ...f, ...patch }));

  return (
    <Modal
      open
      onClose={onClose}
      title={t("marketing.reconciliations.createTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("marketing.common.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={action.pending || !form.connectorId || !metrics.includes(form.metric)}
            onClick={() =>
              void action.run(async () => {
                await marketingApi.createReconciliation(form);
                onSaved();
              })
            }
          >
            {t("marketing.common.save")}
          </Button>
        </>
      }
    >
      {action.error ? <ErrorBanner message={action.error} className="mb-3" /> : null}
      <Notice tone="info">{t("marketing.reconciliations.howTo")}</Notice>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label={t("marketing.reconciliations.fields.connector")} required>
            <select
              className={inputClass}
              value={form.connectorId}
              onChange={(e) => set({ connectorId: e.target.value })}
            >
              <option value="">—</option>
              {(connectors.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t("marketing.reconciliations.fields.metric")} required>
          <select
            className={inputClass}
            value={form.metric}
            onChange={(e) => set({ metric: e.target.value })}
          >
            {metrics.map((m) => (
              <option key={m} value={m}>
                {metricLabel(m)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("marketing.reconciliations.fields.tolerancePct")}>
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            className={inputClass}
            value={form.tolerancePct ?? 1}
            onChange={(e) => set({ tolerancePct: Number(e.target.value) })}
          />
        </Field>
        <Field label={t("marketing.reconciliations.fields.periodFrom")}>
          <input
            type="date"
            className={inputClass}
            value={form.periodFrom}
            onChange={(e) => set({ periodFrom: e.target.value })}
          />
        </Field>
        <Field label={t("marketing.reconciliations.fields.periodTo")}>
          <input
            type="date"
            className={inputClass}
            value={form.periodTo}
            onChange={(e) => set({ periodTo: e.target.value })}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field
            label={t("marketing.reconciliations.fields.sourceValue")}
            hint={t("marketing.reconciliations.sourceValueHint")}
            required
          >
            <input
              type="number"
              step="any"
              className={inputClass}
              value={form.sourceValue}
              onChange={(e) => set({ sourceValue: Number(e.target.value) })}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field
            label={t("marketing.reconciliations.fields.explanation")}
            hint={t("marketing.reconciliations.explanationHint")}
          >
            <textarea
              className={inputClass}
              rows={3}
              value={form.explanation ?? ""}
              onChange={(e) => set({ explanation: e.target.value || null })}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function ReviewButtons({ rec, onDone }: { rec: MarketingReconciliationDto; onDone: () => void }) {
  const t = useT();
  const action = useAction();
  const [comment, setComment] = useState("");
  const review = (decision: "approved" | "rejected") =>
    action.run(async () => {
      await marketingApi.reviewReconciliation(rec.id, { decision, comment: comment || null });
      onDone();
    });
  return (
    <div className="mt-2 space-y-1.5">
      {action.error ? <p className="text-xs text-red-700">{action.error}</p> : null}
      <input
        className={`${inputClass} text-xs`}
        placeholder={t("marketing.reconciliations.reviewComment")}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="primary"
          disabled={action.pending}
          onClick={() => void review("approved")}
        >
          {t("marketing.reconciliations.approve")}
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={action.pending}
          onClick={() => void review("rejected")}
        >
          {t("marketing.reconciliations.reject")}
        </Button>
      </div>
    </div>
  );
}

export default function MarketingReconciliationsPage() {
  const t = useT();
  const { date } = useFormatters();
  const { metricLabel, formatMetric } = useMarketingFormat();
  const queryClient = useQueryClient();
  const { user } = useAuthContext();
  const { can } = useMarketingAccess();
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...queryKeys.marketing, "reconciliations"],
    queryFn: () => marketingApi.listReconciliations(),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.marketing });

  return (
    <div>
      <PageHeader
        title={t("marketing.reconciliations.title")}
        description={t("marketing.reconciliations.description")}
        actions={
          can("marketing.operate") ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              + {t("marketing.reconciliations.create")}
            </Button>
          ) : undefined
        }
      />
      {error ? (
        <ErrorBanner message={t("marketing.common.loadFailed")} onRetry={() => void refetch()} />
      ) : null}
      {isLoading ? (
        <div className="h-32 animate-pulse rounded-xl bg-white" />
      ) : !data?.length ? (
        <EmptyState title={t("marketing.reconciliations.empty")} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">
                  {t("marketing.reconciliations.fields.connector")}
                </th>
                <th className="px-4 py-2 font-medium">
                  {t("marketing.reconciliations.fields.period")}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("marketing.reconciliations.fields.systemValue")}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("marketing.reconciliations.fields.sourceValue")}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  {t("marketing.reconciliations.fields.difference")}
                </th>
                <th className="px-4 py-2 font-medium">
                  {t("marketing.reconciliations.fields.explanation")}
                </th>
                <th className="px-4 py-2 font-medium">
                  {t("marketing.reconciliations.fields.status")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 align-top">
                  <td className="px-4 py-2">
                    {r.connectorName ?? "—"}
                    <span className="block text-xs text-gray-500">{metricLabel(r.metric)}</span>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-xs">
                    {r.periodFrom} – {r.periodTo}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatMetric(r.metric, r.systemValue)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatMetric(r.metric, r.sourceValue)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatMetric(r.metric, r.difference)}
                    <span
                      className={`block text-xs ${r.withinTolerance ? "text-emerald-700" : "text-red-700"}`}
                    >
                      {r.withinTolerance ? "✓" : "✗"}{" "}
                      {r.differenceRatio === null
                        ? "—"
                        : `${(r.differenceRatio * 100).toFixed(2)}%`}{" "}
                      / ±{r.tolerancePct}%
                    </span>
                  </td>
                  <td className="max-w-[260px] px-4 py-2 text-xs text-gray-700">
                    <span className="whitespace-pre-wrap">{r.explanation ?? "—"}</span>
                    <span className="mt-1 block text-gray-500">
                      {r.createdByName ?? "—"} · {date(r.createdAt)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <Pill tone={STATUS_TONE[r.status]}>
                      {t(`marketing.reconciliations.status.${r.status}`)}
                    </Pill>
                    {r.reviewedByName ? (
                      <span className="mt-1 block text-gray-500">
                        {r.reviewedByName}
                        {r.reviewComment ? `: ${r.reviewComment}` : ""}
                      </span>
                    ) : null}
                    {r.status === "pending" &&
                    can("marketing.review") &&
                    r.createdByUserId !== user?.id ? (
                      <ReviewButtons rec={r} onDone={() => void refresh()} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating ? (
        <CreateModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}
