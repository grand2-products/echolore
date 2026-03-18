"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { useSettingsForm } from "@/lib/hooks/use-settings-form";
import { useT } from "@/lib/i18n";
import { INPUT_CLASS, SettingsSaveButton, SettingsSectionShell } from "./SettingsSectionShell";

const DIMENSION_OPTIONS = [768, 1536, 3072] as const;

export function EmbeddingSettingsSection() {
  const t = useT();

  const [embeddingEnabled, setEmbeddingEnabled] = useState(true);
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [embeddingDimensions, setEmbeddingDimensions] = useState<number>(768);
  const [savedDimensions, setSavedDimensions] = useState<number>(768);
  const [needsReindex, setNeedsReindex] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [reindexNotice, setReindexNotice] = useState<string | null>(null);

  const dimensionsChanged = embeddingDimensions !== savedDimensions;

  const { loading, saving, error, notice, loadSettings, handleSave } = useSettingsForm({
    load: () => adminApi.getLlmSettings(),
    onLoaded: (data) => {
      setEmbeddingEnabled(data.embeddingEnabled ?? true);
      setEmbeddingModel(data.embeddingModel ?? "");
      const dims = data.embeddingDimensions ?? 768;
      setEmbeddingDimensions(dims);
      setSavedDimensions(dims);
    },
    save: async () => {
      const dimChanged = embeddingDimensions !== savedDimensions;
      await adminApi.updateLlmSettings({
        embeddingEnabled,
        embeddingModel: embeddingModel || null,
        embeddingDimensions: embeddingDimensions,
      });
      setSavedDimensions(embeddingDimensions);
      if (dimChanged) setNeedsReindex(true);
    },
  });

  async function handleReindex() {
    setReindexing(true);
    setReindexNotice(null);
    try {
      await adminApi.reindexWiki();
      setNeedsReindex(false);
      setReindexNotice(t("admin.settings.llmEmbeddingReindexStarted"));
    } catch {
      setReindexNotice(t("admin.settings.llmEmbeddingReindexError"));
    } finally {
      setReindexing(false);
    }
  }

  return (
    <SettingsSectionShell
      title={t("admin.settings.llmEmbeddingTitle")}
      description={t("admin.settings.llmEmbeddingDescription")}
      error={error}
      notice={notice}
      loading={loading}
      onRetry={() => void loadSettings()}
    >
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
          <input
            value={embeddingModel}
            onChange={(e) => setEmbeddingModel(e.target.value)}
            placeholder="gemini-embedding-2-preview"
            className={INPUT_CLASS}
          />
        </label>

        <label className="block text-sm text-gray-700">
          {t("admin.settings.llmEmbeddingDimensions")}
          <select
            value={embeddingDimensions}
            onChange={(e) => setEmbeddingDimensions(Number(e.target.value))}
            className={INPUT_CLASS}
          >
            {DIMENSION_OPTIONS.map((dim) => (
              <option key={dim} value={dim}>
                {dim}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-gray-500">
            {t("admin.settings.llmEmbeddingDimensionsHint")}
          </span>
        </label>

        {(dimensionsChanged || needsReindex) && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {t("admin.settings.llmEmbeddingReindexWarning")}
          </div>
        )}

        <SettingsSaveButton saving={saving} onClick={() => void handleSave()} />

        {needsReindex && !dimensionsChanged && (
          <button
            type="button"
            disabled={reindexing || saving}
            onClick={() => void handleReindex()}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {reindexing
              ? t("admin.settings.llmEmbeddingReindexing")
              : t("admin.settings.llmEmbeddingReindexButton")}
          </button>
        )}

        {reindexNotice && <div className="text-sm text-gray-600">{reindexNotice}</div>}
      </div>
    </SettingsSectionShell>
  );
}
