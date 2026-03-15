"use client";

import { adminApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import { useStableEvent } from "@/lib/use-stable-event";
import { useEffect, useState } from "react";

const INPUT_CLASS = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2";

export function EmbeddingSettingsSection() {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();

  const [embeddingEnabled, setEmbeddingEnabled] = useState(true);
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSettings = useStableEvent(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.getLlmSettings();
      setEmbeddingEnabled(data.embeddingEnabled ?? true);
      setEmbeddingModel(data.embeddingModel ?? "");
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, t("admin.settings.loadError")));
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await adminApi.updateLlmSettings({
        embeddingEnabled,
        embeddingModel: embeddingModel || null,
      });
      setNotice(t("admin.settings.updated"));
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, t("admin.settings.saveError")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">{t("admin.settings.llmEmbeddingTitle")}</h2>
      <p className="mb-4 text-sm text-gray-500">{t("admin.settings.llmEmbeddingDescription")}</p>

      {error ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => void loadSettings()} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
            {t("common.actions.retry")}
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">{t("admin.settings.loading")}</div>
      ) : (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={embeddingEnabled}
              onChange={(e) => setEmbeddingEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {t("admin.settings.llmEmbeddingEnabled")}
          </label>

          {!embeddingEnabled && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              {t("admin.settings.llmEmbeddingDisabledWarning")}
            </div>
          )}

          <label className="block text-sm text-gray-700">
            {t("admin.settings.llmEmbeddingModel")}
            <input value={embeddingModel} onChange={(e) => setEmbeddingModel(e.target.value)} placeholder="gemini-embedding-002" className={INPUT_CLASS} />
          </label>

          <div className="flex gap-3">
            <button type="button" onClick={() => void handleSave()} disabled={saving} className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60">
              {saving ? t("admin.settings.saving") : t("admin.settings.save")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
