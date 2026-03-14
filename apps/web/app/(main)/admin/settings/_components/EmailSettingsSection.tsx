"use client";

import { adminApi, type EmailProvider } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import { useStableEvent } from "@/lib/use-stable-event";
import { useEffect, useState } from "react";

const INPUT_CLASS = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2";

export function EmailSettingsSection() {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();

  const [emailProvider, setEmailProvider] = useState<EmailProvider>("none");
  const [resendApiKey, setResendApiKey] = useState("");
  const [resendFrom, setResendFrom] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [emailLoading, setEmailLoading] = useState(true);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  const loadEmailSettings = useStableEvent(async () => {
    setEmailLoading(true);
    setEmailError(null);
    try {
      const data = await adminApi.getEmailSettings();
      setEmailProvider(data.provider);
      setResendApiKey(data.resendApiKey ?? "");
      setResendFrom(data.resendFrom ?? "");
      setSmtpHost(data.smtpHost ?? "");
      setSmtpPort(String(data.smtpPort ?? 587));
      setSmtpSecure(data.smtpSecure);
      setSmtpUser(data.smtpUser ?? "");
      setSmtpPass(data.smtpPass ?? "");
      setSmtpFrom(data.smtpFrom ?? "");
    } catch (loadError) {
      setEmailError(getApiErrorMessage(loadError, t("admin.settings.loadError")));
    } finally {
      setEmailLoading(false);
    }
  });

  useEffect(() => {
    void loadEmailSettings();
  }, [loadEmailSettings]);

  const handleEmailSave = async () => {
    setEmailSaving(true);
    setEmailError(null);
    setEmailNotice(null);
    try {
      const payload: Record<string, unknown> = { provider: emailProvider };
      if (emailProvider === "resend") {
        // Only send API key if it's not the masked placeholder
        if (resendApiKey && resendApiKey !== "••••••••") payload.resendApiKey = resendApiKey;
        payload.resendFrom = resendFrom || null;
      } else if (emailProvider === "smtp") {
        payload.smtpHost = smtpHost || null;
        payload.smtpPort = smtpPort ? Number(smtpPort) : null;
        payload.smtpSecure = smtpSecure;
        payload.smtpUser = smtpUser || null;
        // Only send password if it's not the masked placeholder
        if (smtpPass && smtpPass !== "••••••••") payload.smtpPass = smtpPass;
        payload.smtpFrom = smtpFrom || null;
      }
      await adminApi.updateEmailSettings(payload);
      setEmailNotice(t("admin.settings.updated"));
    } catch (saveError) {
      setEmailError(getApiErrorMessage(saveError, t("admin.settings.saveError")));
    } finally {
      setEmailSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">{t("admin.settings.emailTitle")}</h2>
      <p className="mb-4 text-sm text-gray-500">{t("admin.settings.emailDescription")}</p>

      {emailError ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span>{emailError}</span>
          <button type="button" onClick={() => void loadEmailSettings()} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
            {t("common.actions.retry")}
          </button>
        </div>
      ) : null}
      {emailNotice ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{emailNotice}</div>
      ) : null}

      {emailLoading ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">{t("admin.settings.loading")}</div>
      ) : (
        <div className="space-y-4">
          <label className="block text-sm text-gray-700">
            {t("admin.settings.emailProvider")}
            <select value={emailProvider} onChange={(e) => setEmailProvider(e.target.value as EmailProvider)} className={`${INPUT_CLASS} cursor-pointer`}>
              <option value="none">{t("admin.settings.emailProviderNone")}</option>
              <option value="resend">Resend</option>
              <option value="smtp">SMTP</option>
            </select>
          </label>

          {emailProvider === "resend" && (
            <>
              <label className="block text-sm text-gray-700">
                API Key
                <input type="password" value={resendApiKey} onChange={(e) => setResendApiKey(e.target.value)} placeholder="re_..." className={INPUT_CLASS} />
              </label>
              <label className="block text-sm text-gray-700">
                {t("admin.settings.emailFrom")}
                <input type="email" value={resendFrom} onChange={(e) => setResendFrom(e.target.value)} placeholder="noreply@example.com" className={INPUT_CLASS} />
              </label>
            </>
          )}

          {emailProvider === "smtp" && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <label className="col-span-2 block text-sm text-gray-700">
                  {t("admin.settings.smtpHost")}
                  <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" className={INPUT_CLASS} />
                </label>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.smtpPort")}
                  <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} className={INPUT_CLASS} />
                </label>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} className="rounded border-gray-300" />
                {t("admin.settings.smtpSecure")}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.smtpUser")}
                  <input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} className={INPUT_CLASS} />
                </label>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.smtpPass")}
                  <input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} className={INPUT_CLASS} />
                </label>
              </div>
              <label className="block text-sm text-gray-700">
                {t("admin.settings.emailFrom")}
                <input type="email" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="noreply@example.com" className={INPUT_CLASS} />
              </label>
            </>
          )}

          <button type="button" onClick={() => void handleEmailSave()} disabled={emailSaving} className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60">
            {emailSaving ? t("admin.settings.saving") : t("admin.settings.save")}
          </button>
        </div>
      )}
    </section>
  );
}
