"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { useSettingsForm } from "@/lib/hooks/use-settings-form";
import { useT } from "@/lib/i18n";
import { INPUT_CLASS, SettingsSectionShell } from "./SettingsSectionShell";

export function GcpCredentialsSection() {
  const t = useT();

  const [gcpProjectId, setGcpProjectId] = useState("");
  const [gcpServiceAccountKeyJson, setGcpServiceAccountKeyJson] = useState("");

  const { loading, saving, error, notice, loadSettings, handleSave } = useSettingsForm({
    load: () => adminApi.getGcpCredentials(),
    onLoaded: (data) => {
      setGcpProjectId(data.gcpProjectId ?? "");
      setGcpServiceAccountKeyJson(data.gcpServiceAccountKeyJson ?? "");
    },
    save: async () => {
      const payload: Record<string, unknown> = {};
      payload.gcpProjectId = gcpProjectId || null;
      if (gcpServiceAccountKeyJson && gcpServiceAccountKeyJson !== "••••••••") {
        payload.gcpServiceAccountKeyJson = gcpServiceAccountKeyJson;
      }
      await adminApi.updateGcpCredentials(payload);
      await loadSettings();
    },
  });

  return (
    <SettingsSectionShell
      title={t("admin.settings.gcpTitle")}
      description={t("admin.settings.gcpDescription")}
      error={error}
      notice={notice}
      loading={loading}
      onRetry={() => void loadSettings()}
    >
      <div className="space-y-4">
        <label className="block text-sm text-gray-700">
          {t("admin.settings.gcpProjectId")}
          <input
            value={gcpProjectId}
            onChange={(e) => setGcpProjectId(e.target.value)}
            placeholder="my-gcp-project"
            className={INPUT_CLASS}
          />
        </label>

        <label className="block text-sm text-gray-700">
          {t("admin.settings.gcpServiceAccountKey")}
          <textarea
            value={gcpServiceAccountKeyJson}
            onChange={(e) => setGcpServiceAccountKeyJson(e.target.value)}
            rows={4}
            placeholder='{"type":"service_account",...}'
            className={INPUT_CLASS}
          />
        </label>

        <p className="text-xs text-gray-500">{t("admin.settings.gcpAdcHint")}</p>

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
