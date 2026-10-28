"use client";

import {
  CONNECTOR_LINKED_ASSET_TYPES,
  type CreateMarketingConnectorRequest,
  connectorIdentityDiffers,
  connectorIdentityKeys,
  connectorIdentityPrefill,
  MARKETING_CONNECTOR_TYPES,
  type MarketingConnectorDto,
  type MarketingConnectorFieldSpec,
  type MarketingConnectorType,
  type MarketingConnectorTypeDto,
  type MarketingSyncRunDto,
} from "@echolore/shared/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ConnectorSetupDialog } from "@/components/marketing/ConnectorSetupDialog";
import { useMarketingFormat } from "@/components/marketing/format";
import { RunStatusPill, useConnectorsQuery } from "@/components/marketing/ops-widgets";
import {
  AssetSelect,
  Button,
  EmptyState,
  Field,
  inputClass,
  loadingPanelClass,
  Modal,
  Notice,
  PageHeader,
  Pill,
  StatusDot,
  splitList,
  tableWrapClass,
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

function hasConfigValue(config: Record<string, unknown>, key: string): boolean {
  const value = config[key];
  if (typeof value === "string") return value.trim() !== "";
  return value != null && value !== false;
}

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
          timezone: connector.timezone ?? undefined,
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
  const [dirtyIdentityKeys, setDirtyIdentityKeys] = useState<string[]>(() =>
    connector
      ? connectorIdentityKeys(connector.type).filter((key) => hasConfigValue(connector.config, key))
      : []
  );
  const [prefilled, setPrefilled] = useState(false);
  const spec = types.find((x) => x.type === form.type);
  const set = (patch: Partial<CreateMarketingConnectorRequest>) =>
    setForm((f) => ({ ...f, ...patch }));

  const submit = () =>
    action.run(async () => {
      const secretUpdates: Record<string, string> = Object.fromEntries(
        Object.entries(secrets).filter(([, v]) => v.trim() !== "")
      );
      for (const key of cleared) if (!(key in secretUpdates)) secretUpdates[key] = "";
      const body: CreateMarketingConnectorRequest = { ...form, secrets: secretUpdates };
      if (spec?.accountLocale) {
        delete body.timezone;
        delete body.currency;
      }
      if (connector) {
        const { type: _type, ...rest } = body;
        await marketingApi.updateConnector(connector.id, rest);
      } else {
        await marketingApi.createConnector(body);
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
            onChange={(e) => {
              const type = e.target.value as MarketingConnectorType;
              const allowed = CONNECTOR_LINKED_ASSET_TYPES[type];
              const current = assets.data?.find((asset) => asset.id === form.assetId);
              const assetStillFits = !current || !allowed || allowed.includes(current.type);
              setDirtyIdentityKeys([]);
              setPrefilled(false);
              set({
                type,
                config: {},
                assetId: assetStillFits ? form.assetId : null,
                syncIntervalHours: type === "lp_monitor" ? 1 : 24,
              });
            }}
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
            allowedTypes={CONNECTOR_LINKED_ASSET_TYPES[form.type]}
            onChange={(assetId) => {
              const asset = assets.data?.find((item) => item.id === assetId);
              const keys = connectorIdentityKeys(form.type);
              const prefill = connectorIdentityPrefill(form.type, asset?.identifiers ?? {});
              const next = { ...(form.config ?? {}) };
              let copied = false;
              for (const key of keys) {
                if (dirtyIdentityKeys.includes(key)) continue;
                if (prefill[key]) {
                  next[key] = prefill[key];
                  copied = true;
                } else {
                  delete next[key];
                }
              }
              if (copied) setPrefilled(true);
              set({ assetId, config: next });
            }}
          />
        </Field>
        {(() => {
          const linked = assets.data?.find((asset) => asset.id === form.assetId);
          const allowed = CONNECTOR_LINKED_ASSET_TYPES[form.type];
          const mismatch = Boolean(linked && allowed && !allowed.includes(linked.type));
          const differs =
            linked && connectorIdentityDiffers(form.type, form.config ?? {}, linked.identifiers);
          return (
            <>
              {prefilled ? (
                <div className="sm:col-span-2">
                  <Notice tone="info">{t("marketing.connectors.prefillNotice")}</Notice>
                </div>
              ) : null}
              {differs ? (
                <div className="sm:col-span-2">
                  <Notice tone="info">{t("marketing.connectors.identityMismatch")}</Notice>
                </div>
              ) : null}
              {mismatch ? (
                <div className="sm:col-span-2">
                  <Notice tone="warning">{t("marketing.connectors.assetTypeMismatch")}</Notice>
                </div>
              ) : null}
            </>
          );
        })()}
        {spec?.accountLocale ? (
          <div className="sm:col-span-2">
            <Notice tone="info">{t("marketing.connectors.localeFromSource")}</Notice>
            <p className="mt-2 text-sm text-gray-700">
              {connector?.timezone
                ? `${connector.timezone}${connector.currency ? ` · ${connector.currency}` : ""}`
                : t("marketing.connectors.localePending")}
            </p>
          </div>
        ) : (
          <>
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
          </>
        )}
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
                onChange={(v) => {
                  if (connectorIdentityKeys(form.type).includes(f.key)) {
                    setDirtyIdentityKeys((keys) =>
                      keys.includes(f.key) ? keys : [...keys, f.key]
                    );
                  }
                  set({ config: { ...form.config, [f.key]: v } });
                }}
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
  const [setupOpen, setSetupOpen] = useState(false);
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
        actions={
          can("marketing.manage") ? (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setForm({ connector: null })}
                disabled={!types.data}
              >
                {t("marketing.connectors.setup.advanced")}
              </Button>
              <Button variant="primary" onClick={() => setSetupOpen(true)}>
                {t("marketing.connectors.setup.open")}
              </Button>
            </div>
          ) : undefined
        }
      />
      {action.error ? <ErrorBanner message={action.error} className="mb-4" /> : null}
      {error ? (
        <ErrorBanner message={t("marketing.common.loadFailed")} onRetry={() => void refetch()} />
      ) : null}
      {isLoading ? (
        <div className={`h-32 ${loadingPanelClass}`} />
      ) : !data?.length ? (
        <EmptyState
          title={t("marketing.connectors.empty")}
          description={t("marketing.connectors.emptyDescription")}
          action={
            can("marketing.manage") ? (
              <Button variant="primary" onClick={() => setSetupOpen(true)}>
                {t("marketing.connectors.setup.open")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={tableWrapClass}>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-medium text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">{t("marketing.connectors.fields.name")}</th>
                <th className="px-3 py-2 font-medium">{t("marketing.connectors.fields.type")}</th>
                <th className="px-3 py-2 font-medium">{t("marketing.assets.fields.status")}</th>
                <th className="px-3 py-2 font-medium">{t("marketing.connectors.lastSuccess")}</th>
                <th className="px-3 py-2 font-medium">
                  {t("marketing.connectors.fields.syncIntervalHours")}
                </th>
                <th className="px-3 py-2 font-medium">{t("marketing.connectors.fields.asset")}</th>
                <th className="px-3 py-2 font-medium">
                  <span className="sr-only">{t("marketing.common.edit")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => {
                const spec = types.data?.find((x) => x.type === c.type);
                const schedule = !spec?.supportsSync
                  ? "—"
                  : c.type === "lp_monitor"
                    ? t("marketing.connectors.scheduleChecks", { hours: c.syncIntervalHours })
                    : t("marketing.connectors.schedule", {
                        hours: c.syncIntervalHours,
                        days: c.lookbackDays,
                      });
                return (
                  <tr key={c.id} className="border-t border-gray-100 align-top hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{c.name}</div>
                      {c.lastError ? (
                        <p className="mt-0.5 max-w-sm text-xs text-red-700">{c.lastError}</p>
                      ) : null}
                      {testResult?.id === c.id ? (
                        <p
                          className={`mt-0.5 flex items-start gap-1.5 text-xs ${testResult.ok ? "text-emerald-700" : "text-red-700"}`}
                        >
                          <StatusDot tone={testResult.ok ? "emerald" : "red"} />
                          <span>{testResult.message}</span>
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <Pill tone="gray">{t(`marketing.sources.${c.type}`)}</Pill>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <RunStatusPill status={c.lastStatus} />
                        {c.stale ? (
                          <Pill tone="amber">
                            <StatusDot />
                            {t("marketing.connectors.stale")}
                          </Pill>
                        ) : null}
                        {!c.enabled ? (
                          <Pill tone="gray">{t("marketing.connectors.disabled")}</Pill>
                        ) : null}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-gray-700">
                      {c.lastSuccessAt ? dateTime(c.lastSuccessAt) : t("marketing.common.never")}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700">
                      <div>{schedule}</div>
                      <div className="text-gray-500">
                        {c.timezone ?? "—"}
                        {c.currency ? ` ${c.currency}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-800">{c.assetName ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setRunsFor(c)}>
                          {t("marketing.connectors.history")}
                        </Button>
                        {can("marketing.operate") ? (
                          <Button size="sm" variant="ghost" onClick={() => setCsvFor(c)}>
                            {t("marketing.connectors.importCsv")}
                          </Button>
                        ) : null}
                        {can("marketing.manage") ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={action.pending}
                              onClick={() =>
                                void action.run(async () => {
                                  const res = await marketingApi.testConnector(c.id);
                                  setTestResult({ id: c.id, ...res });
                                  if (res.ok) await refetch();
                                })
                              }
                            >
                              {t("marketing.connectors.test")}
                            </Button>
                            {spec?.supportsSync ? (
                              <Button
                                size="sm"
                                variant="ghost"
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
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setForm({ connector: c })}
                            >
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {setupOpen ? (
        <ConnectorSetupDialog
          onClose={() => setSetupOpen(false)}
          onConnected={() => void refresh()}
        />
      ) : null}
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
