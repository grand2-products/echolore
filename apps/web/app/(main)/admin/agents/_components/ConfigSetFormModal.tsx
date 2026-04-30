"use client";

import { useState } from "react";
import { ModalShell } from "@/components/wiki/ModalShell";
import { adminApi, LLM_PROVIDERS, type LlmProvider } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useFormatters, useT } from "@/lib/i18n";
import {
  buildLlmProviderPayload,
  EMPTY_PROVIDER_FORM,
  LlmProviderFields,
  type LlmProviderFormValues,
} from "../../_components/LlmProviderFields";

const INPUT_CLASS = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2";

export interface ConfigSetForm extends LlmProviderFormValues {
  name: string;
  provider: LlmProvider;
}

export const emptyForm: ConfigSetForm = {
  name: "",
  provider: "google",
  ...EMPTY_PROVIDER_FORM,
};

interface ConfigSetFormModalProps {
  editingId: string | null;
  initialForm?: ConfigSetForm | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ConfigSetFormModal({
  editingId,
  initialForm,
  onClose,
  onSaved,
}: ConfigSetFormModalProps) {
  const t = useT();
  const formatters = useFormatters();
  const getApiErrorMessage = useApiErrorMessage();

  const [form, setForm] = useState<ConfigSetForm>(() => initialForm ?? emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        provider: form.provider,
        ...buildLlmProviderPayload(form),
      };

      if (editingId) {
        await adminApi.updateLlmConfigSet(editingId, payload);
      } else {
        await adminApi.createLlmConfigSet(payload as { name: string });
      }
      onSaved();
    } catch (err) {
      setError(getApiErrorMessage(err, t("admin.configSets.saveError")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell open onClose={onClose} maxWidth="max-w-lg">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">
        {editingId ? t("admin.configSets.edit") : t("admin.configSets.create")}
      </h2>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <label className="block text-sm text-gray-700">
          {t("admin.configSets.nameLabel")}
          <input
            value={form.name}
            onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
            className={INPUT_CLASS}
          />
        </label>

        <label className="block text-sm text-gray-700">
          {t("admin.settings.llmProvider")}
          <select
            value={form.provider}
            onChange={(e) => setForm((c) => ({ ...c, provider: e.target.value as LlmProvider }))}
            className={`${INPUT_CLASS} cursor-pointer`}
          >
            {LLM_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {formatters.provider(p)}
              </option>
            ))}
          </select>
        </label>

        <LlmProviderFields
          provider={form.provider}
          values={form}
          onChange={(updates) => setForm((c) => ({ ...c, ...updates }))}
        />

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("common.actions.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !form.name.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {saving
              ? t("admin.settings.saving")
              : editingId
                ? t("admin.configSets.updateAction")
                : t("admin.configSets.createAction")}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
