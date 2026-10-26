"use client";

import {
  type CreateMarketingConnectorRequest,
  MARKETING_CONNECTOR_TYPES,
  type MarketingConnectorDto,
  type MarketingConnectorFieldSpec,
  type MarketingConnectorType,
  type MarketingConnectorTypeDto,
  type MarketingSyncRunDto,
} from "@echolore/shared/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useMarketingFormat } from "@/components/marketing/format";
import { RunStatusPill, useConnectorsQuery } from "@/components/marketing/ops-widgets";
import {
  AssetSelect,
  Button,
  EmptyState,
  Field,
  inputClass,
  Modal,
  Notice,
  PageHeader,
  Pill,
  splitList,
  useAction,
  useMarketingAssets,
} from "@/components/marketing/ui";
import { ErrorBanner } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { marketingApi, queryKeys } from "@/lib/api";
import { useMarketingAccess } from "@/lib/hooks/use-marketing-access";
import { useFormatters, useT } from "@/lib/i18n";

/** Column names accepted by the CSV importer besides metric keys. */
const CSV_DIMENSION_COLUMNS = ["date", "account_id", "campaign_id", "campaign_name", "segment"];

function useConnectorTypes() {
  return useQuery({
    queryKey: [...queryKeys.marketing, "connector-types"],
    queryFn: () => marketingApi.connectorTypes(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

function ConfigInput({
  spec,
  value,
  onChange,
}: {
  spec: MarketingConnectorFieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (spec.kind === "boolean") {
    return (
      <input
        type="checkbox"
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }
  if (spec.kind === "list") {
    const text = Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : "";
    return (
      <textarea
        className={inputClass}
        rows={2}
        placeholder={spec.placeholder}
        defaultValue={text}
        onChange={(e) => onChange(splitList(e.target.value))}
      />
    );
  }
  if (spec.kind === "textarea") {
    return (
      <textarea
        className={inputClass}
        rows={3}
        placeholder={spec.placeholder}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      className={inputClass}
      type={spec.kind === "number" ? "number" : "text"}
      placeholder={spec.placeholder}
      value={typeof value === "string" || typeof value === "number" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function ConnectorForm({
  connector,
  types,
  onClose,
  onSaved,
}: {
  connector: MarketingConnectorDto | null;
  types: MarketingConnectorTypeDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const action = useAction();
  const assets = useMarketingAssets();
  const [form, setForm] = useState<CreateMarketingConnectorRequest>(() =>
    connector
      ? {
          name: connector.name,
          type: connector.type,
          assetId: connector.assetId,
          config: connector.config,
          enabled: connector.enabled,
          syncIntervalHours: connector.syncIntervalHours,
          lookbackDays: connector.lookbackDays,
          timezone: connector.timezone,
          currency: connector.currency,
        }
      : {
          name: "",
          type: "meta_ads",
          config: {},
          enabled: true,
          syncIntervalHours: 24,
          lookbackDays: 7,
          timezone: "Asia/Tokyo",
          currency: "JPY",
        }
  );
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  // Keys the user explicitly asked to clear; an emptied input alone keeps the stored value.
  const [cleared, setCleared] = useState<string[]>([]);
  const spec = types.find((x) => x.type === form.type);
  const set = (patch: Partial<CreateMarketingConnectorRequest>) =>
    setForm((f) => ({ ...f, ...patch }));

  const submit = () =>
    action.run(async () => {
      const secretUpdates: Record<string, string> = Object.fromEntries(
        Object.entries(secrets).filter(([, v]) => v.trim() !== "")
      );
      for (const key of cleared) if (!(key in secretUpdates)) secretUpdates[key] = "";
      if (connector) {
        const { type: _type, ...rest } = form;
        await marketingApi.updateConnector(connector.id, { ...rest, secrets: secretUpdates });
      } else {
        await marketingApi.createConnector({ ...form, secrets: secretUpdates });
      }
      onSaved();
    });

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={
        connector ? t("marketing.connectors.editTitle") : t("marketing.connectors.createTitle")
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("marketing.common.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={action.pending || !form.name.trim()}
          >
            {t("marketing.common.save")}
          </Button>
        </>
      }
    >
      {action.error ? <ErrorBanner message={action.error} className="mb-3" /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("marketing.connectors.fields.name")} required>
          <input
            className={inputClass}
            value={form.name}
            maxLength={200}
            onChange={(e) => set({ name: e.target.value })}
          />
        </Field>
        <Field label={t("marketing.connectors.fields.type")} required>
          <select
            className={inputClass}
            value={form.type}
            disabled={Boolean(connector)}
            onChange={(e) =>
              set({
                type: e.target.value as MarketingConnectorType,
                config: {},
                syncIntervalHours: e.target.value === "lp_monitor" ? 1 : 24,
              })
            }
          >
            {MARKETING_CONNECTOR_TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`marketing.sources.${x}`)}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Notice tone="info">{t(`marketing.connectorHelp.${form.type}`)}</Notice>
        </div>
        <Field label={t("marketing.connectors.fields.asset")}>
          <AssetSelect
            value={form.assetId}
            assets={assets.data}
            onChange={(v) => set({ assetId: v })}
          />
        </Field>
        <Field
          label={t("marketing.connectors.fields.timezone")}
          hint={t("marketing.connectors.timezoneHint")}
        >
          <input
            className={inputClass}
            value={form.timezone ?? ""}
            onChange={(e) => set({ timezone: e.target.value })}
          />
        </Field>
        <Field
          label={t("marketing.connectors.fields.currency")}
          hint={t("marketing.connectors.currencyHint")}
        >
          <input
            className={inputClass}
            value={form.currency ?? ""}
            maxLength={3}
            onChange={(e) => set({ currency: e.target.value.toUpperCase() || null })}
          />
        </Field>
        {spec?.supportsSync ? (
          <>
            <Field label={t("marketing.connectors.fields.syncIntervalHours")}>
              <input
                type="number"
                min={1}
                max={168}
                className={inputClass}
                value={form.syncIntervalHours ?? 24}
                onChange={(e) => set({ syncIntervalHours: Number(e.target.value) || 24 })}
              />
            </Field>
            {form.type !== "lp_monitor" ? (
              <Field
                label={t("marketing.connectors.fields.lookbackDays")}
                hint={t("marketing.connectors.lookbackHint")}
              >
                <input
                  type="number"
                  min={1}
                  max={90}
                  className={inputClass}
                  value={form.lookbackDays ?? 7}
                  onChange={(e) => set({ lookbackDays: Number(e.target.value) || 7 })}
                />
              </Field>
            ) : null}
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.enabled ?? true}
                onChange={(e) => set({ enabled: e.target.checked })}
              />
              {t("marketing.connectors.fields.enabled")}
            </label>
          </>
        ) : null}

        {spec?.configFields.map((f) => (
          <div
            key={`${form.type}-${f.key}`}
            className={f.kind === "list" || f.kind === "textarea" ? "sm:col-span-2" : ""}
          >
            <Field label={t(`marketing.connectorFields.${f.key}`)} required={f.required}>
              <ConfigInput
                spec={f}
                value={form.config?.[f.key]}
                onChange={(v) => set({ config: { ...form.config, [f.key]: v } })}
              />
            </Field>
          </div>
        ))}

        {spec && spec.secretFields.length > 0 ? (
          <div className="sm:col-span-2">
            <Notice tone="warning">{t("marketing.connectors.secretsNotice")}</Notice>
          </div>
        ) : null}
        {spec?.secretFields.map((f) => {
          const configured =
            connector?.configuredSecrets.includes(f.key) && !cleared.includes(f.key);
          return (
            <div key={f.key} className="sm:col-span-2">
              <Field
                label={t(`marketing.connectorFields.${f.key}`)}
                required={f.required && !configured}
                hint={configured ? t("marketing.connectors.secretConfigured") : undefined}
              >
                {f.kind === "textarea" ? (
                  <textarea
                    className={`${inputClass} font-mono`}
                    rows={3}
                    autoComplete="off"
                    placeholder={configured ? "••••••••" : ""}
                    value={secrets[f.key] ?? ""}
                    onChange={(e) => setSecrets({ ...secrets, [f.key]: e.target.value })}
                  />
                ) : (
                  <input
                    type="password"
                    className={inputClass}
                    autoComplete="new-password"
                    placeholder={configured ? "••••••••" : ""}
                    value={secrets[f.key] ?? ""}
                    onChange={(e) => setSecrets({ ...secrets, [f.key]: e.target.value })}
                  />
                )}
              </Field>
              {configured ? (
                <button
                  type="button"
                  className="mt-1 text-xs text-red-600 hover:underline"
                  onClick={() => setCleared([...cleared, f.key])}
                >
                  {t("marketing.connectors.clearSecret")}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function QualitySummary({ run }: { run: MarketingSyncRunDto }) {
  const t = useT();
  const q = run.quality;
  if (!q)
    return run.errorMessage ? (
      <span className="text-red-700">{run.errorMessage}</span>
    ) : (
      <span>—</span>
    );
  const issues = [
    q.duplicateKeys ? t("marketing.runs.duplicates", { count: q.duplicateKeys }) : null,
    q.negativeValues ? t("marketing.runs.negatives", { count: q.negativeValues }) : null,
    q.invalidRows ? t("marketing.runs.invalid", { count: q.invalidRows }) : null,
    q.emptyDates.length ? t("marketing.runs.emptyDates", { count: q.emptyDates.length }) : null,
  ].filter(Boolean);
  return (
    <div>
      <span className={issues.length ? "text-amber-800" : "text-gray-600"}>
        {issues.length ? issues.join(" / ") : t("marketing.runs.noIssues")}
      </span>
      {q.warnings.length ? (
        <ul className="mt-0.5 list-inside list-disc text-xs text-gray-500">
          {q.warnings.slice(0, 5).map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RunsModal({
  connector,
  onClose,
}: {
  connector: MarketingConnectorDto;
  onClose: () => void;
}) {
  const t = useT();
  const { dateTime } = useFormatters();
  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.marketing, "runs", connector.id],
    queryFn: () => marketingApi.listRuns(connector.id),
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === "running") ? 3000 : false),
  });
  return (
    <Modal open onClose={onClose} wide title={t("marketing.runs.title", { name: connector.name })}>
      {isLoading ? (
        <p className="text-sm text-gray-500">{t("common.status.loading")}</p>
      ) : !data?.length ? (
        <p className="text-sm text-gray-500">{t("marketing.runs.empty")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-gray-500">
            <tr className="border-b border-gray-100 text-left">
              <th className="py-1.5 font-medium">{t("marketing.runs.startedAt")}</th>
              <th className="py-1.5 font-medium">{t("marketing.runs.trigger")}</th>
              <th className="py-1.5 font-medium">{t("marketing.runs.status")}</th>
              <th className="py-1.5 font-medium">{t("marketing.runs.range")}</th>
              <th className="py-1.5 text-right font-medium">{t("marketing.runs.rows")}</th>
              <th className="py-1.5 pl-3 font-medium">{t("marketing.runs.quality")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 align-top">
                <td className="py-1.5 whitespace-nowrap">{dateTime(r.startedAt)}</td>
                <td className="py-1.5">
                  {t(`marketing.runs.triggers.${r.trigger}`)}
                  {r.triggeredByName ? (
                    <span className="block text-xs text-gray-500">{r.triggeredByName}</span>
                  ) : null}
                </td>
                <td className="py-1.5">
                  <RunStatusPill status={r.status} />
                </td>
                <td className="py-1.5 whitespace-nowrap text-xs">
                  {r.rangeFrom} – {r.rangeTo}
                </td>
                <td className="py-1.5 text-right tabular-nums">{r.rowsWritten}</td>
                <td className="py-1.5 pl-3 text-xs">
                  <QualitySummary run={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

function CsvImportModal({
  connector,
  spec,
  onClose,
  onDone,
}: {
  connector: MarketingConnectorDto;
  spec: MarketingConnectorTypeDto | undefined;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const { metricLabel } = useMarketingFormat();
  const action = useAction();
  const [file, setFile] = useState<File | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [result, setResult] = useState<MarketingSyncRunDto | null>(null);

  const submit = () =>
    action.run(async () => {
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) throw new Error(t("marketing.csv.tooLarge"));
      const res = await marketingApi.importCsv(connector.id, {
        csv: await file.text(),
        from: from || undefined,
        to: to || undefined,
      });
      setResult(res.run);
      onDone();
    });

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={t("marketing.csv.title", { name: connector.name })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("marketing.common.close")}
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={action.pending || !file}
          >
            {t("marketing.csv.import")}
          </Button>
        </>
      }
    >
      {action.error ? <ErrorBanner message={action.error} className="mb-3" /> : null}
      <Notice tone="info">
        {t("marketing.csv.formatHint")}
        <code className="mt-1 block break-all text-xs">
          {[...CSV_DIMENSION_COLUMNS, ...(spec?.metrics ?? [])].join(",")}
        </code>
        <span className="mt-1 block text-xs">
          {(spec?.metrics ?? []).map((m) => `${m} = ${metricLabel(m)}`).join(" / ")}
        </span>
      </Notice>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <Field label={t("marketing.csv.file")}>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
        </div>
        <Field label={t("marketing.csv.from")} hint={t("marketing.csv.rangeHint")}>
          <input
            type="date"
            className={inputClass}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label={t("marketing.csv.to")}>
          <input
            type="date"
            className={inputClass}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </div>
      {result ? (
        <div className="mt-4 rounded-lg border border-gray-200 p-3 text-sm">
          <div className="mb-1 flex items-center gap-2">
            <RunStatusPill status={result.status} />
            <span className="text-gray-700">
              {result.rangeFrom} – {result.rangeTo} ·{" "}
              {t("marketing.csv.written", { count: result.rowsWritten })}
            </span>
          </div>
          <QualitySummary run={result} />
        </div>
      ) : null}
    </Modal>
  );
}

export default function MarketingConnectorsPage() {
  const t = useT();
  const { dateTime } = useFormatters();
  const queryClient = useQueryClient();
  const { can } = useMarketingAccess();
  const action = useAction();
  const { data, isLoading, error, refetch } = useConnectorsQuery();
  const types = useConnectorTypes();
  const [form, setForm] = useState<{ connector: MarketingConnectorDto | null } | null>(null);
  const [runsFor, setRunsFor] = useState<MarketingConnectorDto | null>(null);
  const [csvFor, setCsvFor] = useState<MarketingConnectorDto | null>(null);
  const [deleting, setDeleting] = useState<MarketingConnectorDto | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(
    null
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.marketing });

  return (
    <div>
      <PageHeader
        title={t("marketing.connectors.title")}
        description={t("marketing.connectors.description")}
        actions={
          can("marketing.manage") ? (
            <Button
              variant="primary"
              onClick={() => setForm({ connector: null })}
              disabled={!types.data}
            >
              + {t("marketing.connectors.create")}
            </Button>
          ) : undefined
        }
      />
      {action.error ? <ErrorBanner message={action.error} className="mb-4" /> : null}
      {error ? (
        <ErrorBanner message={t("marketing.common.loadFailed")} onRetry={() => void refetch()} />
      ) : null}
      {isLoading ? (
        <div className="h-32 animate-pulse rounded-xl bg-white" />
      ) : !data?.length ? (
        <EmptyState
          title={t("marketing.connectors.empty")}
          description={t("marketing.connectors.emptyDescription")}
        />
      ) : (
        <div className="space-y-3">
          {data.map((c) => {
            const spec = types.data?.find((x) => x.type === c.type);
            return (
              <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-gray-900">{c.name}</h3>
                      <Pill tone="blue">{t(`marketing.sources.${c.type}`)}</Pill>
                      <RunStatusPill status={c.lastStatus} />
                      {c.stale ? (
                        <Pill tone="amber">⚠ {t("marketing.connectors.stale")}</Pill>
                      ) : null}
                      {!c.enabled ? (
                        <Pill tone="gray">{t("marketing.connectors.disabled")}</Pill>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {c.assetName
                        ? `${t("marketing.connectors.fields.asset")}: ${c.assetName} · `
                        : ""}
                      {t("marketing.connectors.lastSuccess")}:{" "}
                      {c.lastSuccessAt ? dateTime(c.lastSuccessAt) : t("marketing.common.never")}
                      {spec?.supportsSync
                        ? ` · ${
                            c.type === "lp_monitor"
                              ? t("marketing.connectors.scheduleChecks", {
                                  hours: c.syncIntervalHours,
                                })
                              : t("marketing.connectors.schedule", {
                                  hours: c.syncIntervalHours,
                                  days: c.lookbackDays,
                                })
                          }`
                        : ""}
                      {` · ${c.timezone}${c.currency ? ` / ${c.currency}` : ""}`}
                    </p>
                    {c.lastError ? (
                      <p className="mt-1 text-xs text-red-700">{c.lastError}</p>
                    ) : null}
                    {testResult?.id === c.id ? (
                      <p
                        className={`mt-1 text-xs ${testResult.ok ? "text-emerald-700" : "text-red-700"}`}
                      >
                        {testResult.ok ? "✓" : "✗"} {testResult.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" onClick={() => setRunsFor(c)}>
                      {t("marketing.connectors.history")}
                    </Button>
                    {can("marketing.operate") ? (
                      <Button size="sm" onClick={() => setCsvFor(c)}>
                        {t("marketing.connectors.importCsv")}
                      </Button>
                    ) : null}
                    {can("marketing.manage") ? (
                      <>
                        <Button
                          size="sm"
                          disabled={action.pending}
                          onClick={() =>
                            void action.run(async () => {
                              const res = await marketingApi.testConnector(c.id);
                              setTestResult({ id: c.id, ...res });
                            })
                          }
                        >
                          {t("marketing.connectors.test")}
                        </Button>
                        {spec?.supportsSync ? (
                          <Button
                            size="sm"
                            disabled={action.pending}
                            onClick={() =>
                              void action.run(async () => {
                                await marketingApi.syncConnector(c.id);
                                await refresh();
                                setRunsFor(c);
                              })
                            }
                          >
                            {t("marketing.connectors.syncNow")}
                          </Button>
                        ) : null}
                        <Button size="sm" onClick={() => setForm({ connector: c })}>
                          {t("marketing.common.edit")}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600"
                          onClick={() => setDeleting(c)}
                        >
                          {t("marketing.common.delete")}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form && types.data ? (
        <ConnectorForm
          connector={form.connector}
          types={types.data}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            void refresh();
          }}
        />
      ) : null}
      {runsFor ? <RunsModal connector={runsFor} onClose={() => setRunsFor(null)} /> : null}
      {csvFor ? (
        <CsvImportModal
          connector={csvFor}
          spec={types.data?.find((x) => x.type === csvFor.type)}
          onClose={() => setCsvFor(null)}
          onDone={() => void refresh()}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        title={t("marketing.connectors.deleteTitle")}
        description={t("marketing.connectors.deleteDescription")}
        onConfirm={() => {
          const target = deleting;
          setDeleting(null);
          if (target)
            void action.run(async () => {
              await marketingApi.deleteConnector(target.id);
              await refresh();
            });
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
