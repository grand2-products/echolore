"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { useSettingsForm } from "@/lib/hooks/use-settings-form";
import { useT } from "@/lib/i18n";
import { INPUT_CLASS, SettingsSectionShell } from "./SettingsSectionShell";

export function EmbeddingSettingsSection() {
  const t = useT();

  const [embeddingEnabled, setEmbeddingEnabled] = useState(true);
  const [embeddingModel, setEmbeddingModel] = useState("");

  const { loading, saving, error, notice, loadSettings, handleSave } = useSettingsForm({
    load: () => adminApi.getLlmSettings(),
    onLoaded: (data) => {
      setEmbeddingEnabled(data.embeddingEnabled ?? true);
      setEmbeddingModel(data.embeddingModel ?? "");
    },
    save: async () => {
      await adminApi.updateLlmSettings({
        embeddingEnabled,
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
          {t("admin.settings.llmEmbeddingModel")}
          <input
            value={embeddingModel}
            onChange={(e) => setEmbeddingModel(e.target.value)}
            placeholder="gemini-embedding-002"
            className={INPUT_CLASS}
          />
        </label>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {saving ? t("admin.settings.saving") : t("admin.settings.save")}
          </button>
        </div>
      </div>
    </SettingsSectionShell>
  );
}
