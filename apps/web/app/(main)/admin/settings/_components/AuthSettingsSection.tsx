"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { useSettingsForm } from "@/lib/hooks/use-settings-form";
import { useT } from "@/lib/i18n";
import { INPUT_CLASS, SettingsSectionShell } from "./SettingsSectionShell";

export function AuthSettingsSection() {
  const t = useT();

  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [allowedDomain, setAllowedDomain] = useState("");
  const [googleIosClientId, setGoogleIosClientId] = useState("");
  const [googleAndroidClientId, setGoogleAndroidClientId] = useState("");
  const [googleOauthAudiences, setGoogleOauthAudiences] = useState("");

  const { loading, saving, error, notice, loadSettings, handleSave } = useSettingsForm({
    load: () => adminApi.getAuthSettings(),
    onLoaded: (data) => {
      setGoogleClientId(data.googleClientId ?? "");
      setGoogleClientSecret(data.googleClientSecret ?? "");
      setAllowedDomain(data.allowedDomain ?? "");
      setGoogleIosClientId(data.googleIosClientId ?? "");
      setGoogleAndroidClientId(data.googleAndroidClientId ?? "");
      setGoogleOauthAudiences(data.googleOauthAudiences ?? "");
    },
    save: async () => {
      const payload: Record<string, unknown> = {};
      payload.googleClientId = googleClientId || null;
      if (googleClientSecret && googleClientSecret !== "••••••••") {
        payload.googleClientSecret = googleClientSecret;
      }
      payload.allowedDomain = allowedDomain || null;
      payload.googleIosClientId = googleIosClientId || null;
      payload.googleAndroidClientId = googleAndroidClientId || null;
      payload.googleOauthAudiences = googleOauthAudiences || null;
      await adminApi.updateAuthSettings(payload);
      await loadSettings();
    },
  });

  return (
    <SettingsSectionShell
      title={t("admin.settings.authTitle")}
      description={t("admin.settings.authDescription")}
      error={error}
      notice={notice}
      loading={loading}
      onRetry={() => void loadSettings()}
    >
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-900">{t("admin.settings.authGoogleSso")}</h3>

        <label className="block text-sm text-gray-700">
          {t("admin.settings.authGoogleClientId")}
          <input
            value={googleClientId}
            onChange={(e) => setGoogleClientId(e.target.value)}
            placeholder="xxxx.apps.googleusercontent.com"
            className={INPUT_CLASS}
          />
        </label>

        <label className="block text-sm text-gray-700">
          {t("admin.settings.authGoogleClientSecret")}
          <input
            type="password"
            value={googleClientSecret}
            onChange={(e) => setGoogleClientSecret(e.target.value)}
            autoComplete="off"
            className={INPUT_CLASS}
          />
        </label>

        <label className="block text-sm text-gray-700">
          {t("admin.settings.authAllowedDomain")}
          <input
            value={allowedDomain}
            onChange={(e) => setAllowedDomain(e.target.value)}
            placeholder="example.com"
            className={INPUT_CLASS}
          />
        </label>

        <hr className="border-gray-200" />
        <h3 className="text-sm font-medium text-gray-900">{t("admin.settings.authMobileOauth")}</h3>

        <label className="block text-sm text-gray-700">
          {t("admin.settings.authIosClientId")}
          <input
            value={googleIosClientId}
            onChange={(e) => setGoogleIosClientId(e.target.value)}
            className={INPUT_CLASS}
          />
        </label>

        <label className="block text-sm text-gray-700">
          {t("admin.settings.authAndroidClientId")}
          <input
            value={googleAndroidClientId}
            onChange={(e) => setGoogleAndroidClientId(e.target.value)}
            className={INPUT_CLASS}
          />
        </label>

        <label className="block text-sm text-gray-700">
          {t("admin.settings.authExtraAudiences")}
          <input
            value={googleOauthAudiences}
            onChange={(e) => setGoogleOauthAudiences(e.target.value)}
            placeholder="aud1,aud2"
            className={INPUT_CLASS}
          />
          <p className="mt-1 text-xs text-gray-500">{t("admin.settings.authExtraAudiencesHint")}</p>
        </label>

        <p className="text-xs text-gray-500">{t("admin.settings.authEnvFallbackHint")}</p>

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
