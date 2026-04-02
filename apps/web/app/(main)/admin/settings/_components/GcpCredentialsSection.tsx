"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { useSettingsForm } from "@/lib/hooks/use-settings-form";
import { useT } from "@/lib/i18n";
import { INPUT_CLASS, SettingsSaveButton, SettingsSectionShell } from "./SettingsSectionShell";
import type { TestModalState } from "./TestConnectionModal";
import { useConnectionTest } from "./use-connection-test";

interface GcpCredentialsSectionProps {
  onTestModal?: (modal: TestModalState | null) => void;
}

export function GcpCredentialsSection({ onTestModal }: GcpCredentialsSectionProps) {
  const t = useT();

  const [gcpProjectId, setGcpProjectId] = useState("");
  const [gcpServiceAccountKeyJson, setGcpServiceAccountKeyJson] = useState("");

  const { loading, saving, error, notice, setError, setNotice, loadSettings, handleSave } =
    useSettingsForm({
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

  const { testing, handleTest } = useConnectionTest({
    title: t("admin.settings.gcpTestTitle"),
    test: async () => {
      const res = await adminApi.testGcpConnection();
      if (res.ok) {
        return {
          ok: true,
          message: t("admin.settings.gcpTestSuccess", {
            projectId: res.projectId ?? "-",
            clientEmail: res.clientEmail ?? "-",
          }),
        };
      }
      return { ok: false, message: res.error ?? t("admin.settings.gcpTestFail"), error: res.error };
    },
    setError,
    setNotice,
    onTestModal: onTestModal ?? (() => {}),
    testingMessage: t("admin.settings.gcpTestTesting"),
    failMessage: t("admin.settings.gcpTestFail"),
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

        <div className="flex items-center gap-3">
          <SettingsSaveButton saving={saving} onClick={() => void handleSave()} />
          {onTestModal && (
            <button
              type="button"
              disabled={testing}
              onClick={() => void handleTest()}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {testing ? t("admin.settings.testing") : t("admin.settings.testConnection")}
            </button>
          )}
        </div>
      </div>
    </SettingsSectionShell>
  );
}
