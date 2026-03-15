"use client";

import { adminApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import { useStableEvent } from "@/lib/use-stable-event";
import { useEffect, useState } from "react";

const INPUT_CLASS = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2";

export function AuthSettingsSection() {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();

  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [allowedDomain, setAllowedDomain] = useState("");
  const [googleIosClientId, setGoogleIosClientId] = useState("");
  const [googleAndroidClientId, setGoogleAndroidClientId] = useState("");
  const [googleOauthAudiences, setGoogleOauthAudiences] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSettings = useStableEvent(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.getAuthSettings();
      setGoogleClientId(data.googleClientId ?? "");
      setGoogleClientSecret(data.googleClientSecret ?? "");
      setAllowedDomain(data.allowedDomain ?? "");
      setGoogleIosClientId(data.googleIosClientId ?? "");
      setGoogleAndroidClientId(data.googleAndroidClientId ?? "");
      setGoogleOauthAudiences(data.googleOauthAudiences ?? "");
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
      setNotice(t("admin.settings.updated"));
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, t("admin.settings.saveError")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">{t("admin.settings.authTitle")}</h2>
      <p className="mb-4 text-sm text-gray-500">{t("admin.settings.authDescription")}</p>

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
          <h3 className="text-sm font-medium text-gray-900">{t("admin.settings.authGoogleSso")}</h3>

          <label className="block text-sm text-gray-700">
            {t("admin.settings.authGoogleClientId")}
            <input value={googleClientId} onChange={(e) => setGoogleClientId(e.target.value)} placeholder="xxxx.apps.googleusercontent.com" className={INPUT_CLASS} />
          </label>

          <label className="block text-sm text-gray-700">
            {t("admin.settings.authGoogleClientSecret")}
            <input type="password" value={googleClientSecret} onChange={(e) => setGoogleClientSecret(e.target.value)} className={INPUT_CLASS} />
          </label>

          <label className="block text-sm text-gray-700">
            {t("admin.settings.authAllowedDomain")}
            <input value={allowedDomain} onChange={(e) => setAllowedDomain(e.target.value)} placeholder="example.com" className={INPUT_CLASS} />
          </label>

          <hr className="border-gray-200" />
          <h3 className="text-sm font-medium text-gray-900">{t("admin.settings.authMobileOauth")}</h3>

          <label className="block text-sm text-gray-700">
            {t("admin.settings.authIosClientId")}
            <input value={googleIosClientId} onChange={(e) => setGoogleIosClientId(e.target.value)} className={INPUT_CLASS} />
          </label>

          <label className="block text-sm text-gray-700">
            {t("admin.settings.authAndroidClientId")}
            <input value={googleAndroidClientId} onChange={(e) => setGoogleAndroidClientId(e.target.value)} className={INPUT_CLASS} />
          </label>

          <label className="block text-sm text-gray-700">
            {t("admin.settings.authExtraAudiences")}
            <input value={googleOauthAudiences} onChange={(e) => setGoogleOauthAudiences(e.target.value)} placeholder="aud1,aud2" className={INPUT_CLASS} />
            <p className="mt-1 text-xs text-gray-500">{t("admin.settings.authExtraAudiencesHint")}</p>
          </label>

          <p className="text-xs text-gray-500">{t("admin.settings.authEnvFallbackHint")}</p>

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
