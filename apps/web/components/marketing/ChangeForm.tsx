"use client";

import {
  MARKETING_CHANGE_TYPES,
  MARKETING_POST_REVIEW_TYPES,
  MARKETING_SEVERITIES,
  type MarketingChangeRequestDto,
  type UpsertMarketingChangeRequest,
} from "@echolore/shared/contracts";
import { useState } from "react";
import { ErrorBanner } from "@/components/ui";
import { marketingApi } from "@/lib/api";
import { useT } from "@/lib/i18n";
import {
  AssetSelect,
  Button,
  Field,
  inputClass,
  Modal,
  Notice,
  splitList,
  useAction,
  useMarketingAssets,
  WikiPageSelect,
} from "./ui";

export function toChangeForm(c: MarketingChangeRequestDto): UpsertMarketingChangeRequest {
  return {
    type: c.type,
    title: c.title,
    purpose: c.purpose,
    assetId: c.assetId,
    severity: c.severity,
    beforeState: c.beforeState,
    afterState: c.afterState,
    impact: c.impact,
    rollbackPlan: c.rollbackPlan,
    scheduledAt: c.scheduledAt,
    evidenceUrls: c.evidenceUrls,
    wikiPageId: c.wikiPageId,
  };
}

const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function ChangeForm({
  changeId,
  initial,
  onClose,
  onSaved,
}: {
  changeId: string | null;
  initial: UpsertMarketingChangeRequest;
  onClose: () => void;
  onSaved: (change: MarketingChangeRequestDto) => void;
}) {
  const t = useT();
  const action = useAction();
  const assets = useMarketingAssets();
  const [form, setForm] = useState(initial);
  const [evidenceText, setEvidenceText] = useState((initial.evidenceUrls ?? []).join("\n"));
  const set = (patch: Partial<UpsertMarketingChangeRequest>) =>
    setForm((f) => ({ ...f, ...patch }));
  const text = (key: keyof UpsertMarketingChangeRequest) => ({
    value: (form[key] as string | null | undefined) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      set({ [key]: e.target.value || null } as Partial<UpsertMarketingChangeRequest>),
  });
  const postReview = MARKETING_POST_REVIEW_TYPES.includes(form.type);

  const submit = () =>
    action.run(async () => {
      const body = { ...form, evidenceUrls: splitList(evidenceText) };
      const saved = changeId
        ? await marketingApi.updateChange(changeId, body)
        : await marketingApi.createChange(body);
      onSaved(saved);
    });

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={changeId ? t("marketing.changes.editTitle") : t("marketing.changes.createTitle")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("marketing.common.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={action.pending || !form.title.trim()}
          >
            {t("marketing.common.save")}
          </Button>
        </>
      }
    >
      {action.error ? <ErrorBanner message={action.error} className="mb-3" /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("marketing.changes.fields.type")} required>
          <select
            className={inputClass}
            value={form.type}
            onChange={(e) => set({ type: e.target.value as UpsertMarketingChangeRequest["type"] })}
          >
            {MARKETING_CHANGE_TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`marketing.changeTypes.${x}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("marketing.changes.fields.asset")}>
          <AssetSelect
            value={form.assetId}
            assets={assets.data}
            onChange={(v) => set({ assetId: v })}
          />
        </Field>
        <div className="sm:col-span-2">
          <Notice tone={postReview ? "warning" : "info"}>
            {t(`marketing.changeTypeHelp.${form.type}`)}
          </Notice>
        </div>
        <div className="sm:col-span-2">
          <Field label={t("marketing.changes.fields.title")} required>
            <input className={inputClass} maxLength={300} {...text("title")} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t("marketing.changes.fields.purpose")}>
            <textarea className={inputClass} rows={2} maxLength={5000} {...text("purpose")} />
          </Field>
        </div>
        <Field label={t("marketing.changes.fields.beforeState")}>
          <textarea className={inputClass} rows={3} maxLength={5000} {...text("beforeState")} />
        </Field>
        <Field label={t("marketing.changes.fields.afterState")}>
          <textarea className={inputClass} rows={3} maxLength={5000} {...text("afterState")} />
        </Field>
        <Field label={t("marketing.changes.fields.impact")}>
          <textarea className={inputClass} rows={2} maxLength={5000} {...text("impact")} />
        </Field>
        <Field label={t("marketing.changes.fields.rollbackPlan")}>
          <textarea className={inputClass} rows={2} maxLength={5000} {...text("rollbackPlan")} />
        </Field>
        <Field label={t("marketing.changes.fields.severity")}>
          <select
            className={inputClass}
            value={form.severity ?? ""}
            onChange={(e) =>
              set({
                severity: (e.target.value || null) as UpsertMarketingChangeRequest["severity"],
              })
            }
          >
            <option value="">{t("marketing.common.none")}</option>
            {MARKETING_SEVERITIES.map((x) => (
              <option key={x} value={x}>
                {t(`marketing.severity.${x}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("marketing.changes.fields.scheduledAt")}>
          <input
            type="datetime-local"
            className={inputClass}
            value={toLocalInput(form.scheduledAt)}
            onChange={(e) =>
              set({ scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null })
            }
          />
        </Field>
        <div className="sm:col-span-2">
          <Field
            label={t("marketing.changes.fields.evidenceUrls")}
            hint={t("marketing.changes.evidenceHint")}
          >
            <textarea
              className={inputClass}
              rows={2}
              value={evidenceText}
              onChange={(e) => setEvidenceText(e.target.value)}
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t("marketing.changes.fields.wikiPage")}>
            <WikiPageSelect value={form.wikiPageId} onChange={(v) => set({ wikiPageId: v })} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
