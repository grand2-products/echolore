"use client";

import { useState } from "react";
import { adminApi, type EmbeddingProvider } from "@/lib/api";
import { useSettingsForm } from "@/lib/hooks/use-settings-form";
import { useT } from "@/lib/i18n";
import { INPUT_CLASS, SettingsSaveButton, SettingsSectionShell } from "./SettingsSectionShell";

export function EmbeddingSettingsSection() {
  const t = useT();

  const [embeddingEnabled, setEmbeddingEnabled] = useState(true);
  const [embeddingProvider, setEmbeddingProvider] = useState<EmbeddingProvider>("google");
  const [embeddingModel, setEmbeddingModel] = useState("");

  const { loading, saving, error, notice, loadSettings, handleSave } = useSettingsForm({
    load: () => adminApi.getLlmSettings(),
    onLoaded: (data) => {
      setEmbeddingEnabled(data.embeddingEnabled ?? true);
      setEmbeddingProvider(data.embeddingProvider ?? "google");
      setEmbeddingModel(data.embeddingModel ?? "");
    },
    save: async () => {
      await adminApi.updateLlmSettings({
        embeddingEnabled,
        embeddingProvider,
        embeddingModel: embeddingModel || null,
      });
    },
  });

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
          {t("admin.settings.llmEmbeddingProvider")}
          <select
            value={embeddingProvider}
            onChange={(e) => setEmbeddingProvider(e.target.value as EmbeddingProvider)}
            className={`${INPUT_CLASS} cursor-pointer`}
          >
            <option value="google">{t("common.providerGoogle")}</option>
            <option value="vertex">{t("common.providerVertex")}</option>
          </select>
        </label>
        <p className="text-xs text-gray-500">
          {embeddingProvider === "vertex"
            ? t("admin.settings.llmEmbeddingProviderVertexHint")
            : t("admin.settings.llmEmbeddingProviderGoogleHint")}
        </p>

        <label className="block text-sm text-gray-700">
          {t("admin.settings.llmEmbeddingModel")}
          <input
            value={embeddingModel}
            onChange={(e) => setEmbeddingModel(e.target.value)}
            placeholder="gemini-embedding-2-preview"
            className={INPUT_CLASS}
          />
        </label>

        <SettingsSaveButton saving={saving} onClick={() => void handleSave()} />
      </div>
    </SettingsSectionShell>
  );
}
