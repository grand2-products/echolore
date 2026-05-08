"use client";

import { useState } from "react";
import { adminApi, GEMINI_TTS_VOICES, TTS_PROVIDERS, type TtsProvider } from "@/lib/api";
import { useSettingsForm } from "@/lib/hooks/use-settings-form";
import { useT } from "@/lib/i18n";
import { INPUT_CLASS, SettingsSaveButton, SettingsSectionShell } from "./SettingsSectionShell";
import type { TestModalState } from "./TestConnectionModal";
import { useConnectionTest } from "./use-connection-test";

interface TtsSettingsSectionProps {
  onTestModal: (modal: TestModalState | null) => void;
}

interface TtsSettingsForm {
  provider: TtsProvider;
  geminiApiKey: string;
  geminiModel: string;
  geminiVoiceName: string;
}

const emptyForm: TtsSettingsForm = {
  provider: "google-cloud",
  geminiApiKey: "",
  geminiModel: "",
  geminiVoiceName: "Kore",
};

export function TtsSettingsSection({ onTestModal }: TtsSettingsSectionProps) {
  const t = useT();

  const [form, setForm] = useState<TtsSettingsForm>(emptyForm);
  const { loading, saving, error, notice, loadSettings, handleSave, setError, setNotice } =
    useSettingsForm({
      load: () => adminApi.getTtsSettings(),
      onLoaded: (data) => {
        setForm({
          provider: data.provider,
          geminiApiKey: data.geminiApiKey ?? "",
          geminiModel: data.geminiModel ?? "",
          geminiVoiceName: data.geminiVoiceName ?? "Kore",
        });
      },
      save: async () => {
        await adminApi.updateTtsSettings({
          provider: form.provider,
          geminiApiKey: form.provider === "gemini" ? form.geminiApiKey || null : null,
          geminiModel: form.provider === "gemini" ? form.geminiModel || null : null,
          geminiVoiceName: form.provider === "gemini" ? form.geminiVoiceName || null : null,
        });
      },
    });

  const { testing, handleTest } = useConnectionTest({
    title: t("admin.settings.ttsTestTitle"),
    test: async () => {
      const result = await adminApi.testTtsConnection();
      return {
        ok: result.ok,
        message: result.ok ? t("admin.settings.ttsTestSuccess") : "",
        error: result.error,
      };
    },
    setError,
    setNotice,
    onTestModal,
    testingMessage: t("admin.settings.ttsTesting"),
    failMessage: t("admin.settings.ttsTestFail"),
  });

  return (
    <SettingsSectionShell
      title={t("admin.settings.ttsTitle")}
      description={t("admin.settings.ttsDescription")}
      error={error}
      notice={notice}
      loading={loading}
      onRetry={() => void loadSettings()}
    >
      <div className="space-y-4">
        <label className="block text-sm text-gray-700">
          {t("admin.settings.ttsProvider")}
          <select
            value={form.provider}
            onChange={(e) => setForm((c) => ({ ...c, provider: e.target.value as TtsProvider }))}
            className={`${INPUT_CLASS} cursor-pointer`}
          >
            {TTS_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {t(`admin.settings.ttsProvider${p === "google-cloud" ? "GoogleCloud" : "Gemini"}`)}
              </option>
            ))}
          </select>
        </label>

        {form.provider === "google-cloud" ? (
          <p className="text-xs text-gray-500">{t("admin.settings.ttsGoogleCloudHint")}</p>
        ) : (
          <>
            <p className="text-xs text-gray-500">{t("admin.settings.ttsGeminiHint")}</p>

            <label className="block text-sm text-gray-700">
              {t("admin.settings.ttsGeminiApiKey")}
              <input
                type="password"
                value={form.geminiApiKey}
                onChange={(e) => setForm((c) => ({ ...c, geminiApiKey: e.target.value }))}
                className={INPUT_CLASS}
                autoComplete="off"
              />
            </label>

            <label className="block text-sm text-gray-700">
              {t("admin.settings.ttsGeminiModel")}
              <input
                type="text"
                value={form.geminiModel}
                onChange={(e) => setForm((c) => ({ ...c, geminiModel: e.target.value }))}
                placeholder="gemini-2.5-flash-preview-tts"
                className={INPUT_CLASS}
              />
              <span className="mt-1 text-xs text-gray-500">
                {t("admin.settings.ttsGeminiModelHint")}
              </span>
            </label>

            <label className="block text-sm text-gray-700">
              {t("admin.settings.ttsGeminiVoiceName")}
              <select
                value={form.geminiVoiceName}
                onChange={(e) => setForm((c) => ({ ...c, geminiVoiceName: e.target.value }))}
                className={`${INPUT_CLASS} cursor-pointer`}
              >
                {GEMINI_TTS_VOICES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <span className="mt-1 text-xs text-gray-500">
                {t("admin.settings.ttsGeminiVoiceNameHint")}
              </span>
            </label>
          </>
        )}

        <div className="flex gap-3">
          <SettingsSaveButton
            saving={saving}
            onClick={() => void handleSave()}
            widthClass="flex-1"
          />
          <button
            type="button"
            onClick={() => void handleTest()}
            disabled={testing || saving}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {testing ? t("admin.settings.ttsTesting") : t("admin.settings.ttsTest")}
          </button>
        </div>
      </div>
    </SettingsSectionShell>
  );
}
