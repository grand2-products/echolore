"use client";

import { useState } from "react";
import { adminApi, type EmailProvider } from "@/lib/api";
import { useSettingsForm } from "@/lib/hooks/use-settings-form";
import { useT } from "@/lib/i18n";
import { INPUT_CLASS, SettingsSaveButton, SettingsSectionShell } from "./SettingsSectionShell";

export function EmailSettingsSection() {
  const t = useT();

  const [emailProvider, setEmailProvider] = useState<EmailProvider>("none");
  const [resendApiKey, setResendApiKey] = useState("");
  const [resendFrom, setResendFrom] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");

  const { loading, saving, error, notice, loadSettings, handleSave } = useSettingsForm({
    load: () => adminApi.getEmailSettings(),
    onLoaded: (data) => {
      setEmailProvider(data.provider);
      setResendApiKey(data.resendApiKey ?? "");
      setResendFrom(data.resendFrom ?? "");
      setSmtpHost(data.smtpHost ?? "");
      setSmtpPort(String(data.smtpPort ?? 587));
      setSmtpSecure(data.smtpSecure);
      setSmtpUser(data.smtpUser ?? "");
      setSmtpPass(data.smtpPass ?? "");
      setSmtpFrom(data.smtpFrom ?? "");
    },
    save: async () => {
      const payload: Record<string, unknown> = { provider: emailProvider };
      if (emailProvider === "resend") {
        if (resendApiKey && resendApiKey !== "••••••••") payload.resendApiKey = resendApiKey;
        payload.resendFrom = resendFrom || null;
      } else if (emailProvider === "smtp") {
        payload.smtpHost = smtpHost || null;
        payload.smtpPort = smtpPort ? Number(smtpPort) : null;
        payload.smtpSecure = smtpSecure;
        payload.smtpUser = smtpUser || null;
        if (smtpPass && smtpPass !== "••••••••") payload.smtpPass = smtpPass;
        payload.smtpFrom = smtpFrom || null;
      }
      await adminApi.updateEmailSettings(payload);
    },
  });

  return (
    <SettingsSectionShell
      title={t("admin.settings.emailTitle")}
      description={t("admin.settings.emailDescription")}
      error={error}
      notice={notice}
      loading={loading}
      onRetry={() => void loadSettings()}
    >
      <div className="space-y-4">
        <label className="block text-sm text-gray-700">
          {t("admin.settings.emailProvider")}
          <select
            value={emailProvider}
            onChange={(e) => setEmailProvider(e.target.value as EmailProvider)}
            className={`${INPUT_CLASS} cursor-pointer`}
          >
            <option value="none">{t("admin.settings.emailProviderNone")}</option>
            <option value="resend">Resend</option>
            <option value="smtp">SMTP</option>
          </select>
        </label>

        {emailProvider === "resend" && (
          <>
            <label className="block text-sm text-gray-700">
              API Key
              <input
                type="password"
                value={resendApiKey}
                onChange={(e) => setResendApiKey(e.target.value)}
                placeholder="re_..."
                autoComplete="off"
                className={INPUT_CLASS}
              />
            </label>
            <label className="block text-sm text-gray-700">
              {t("admin.settings.emailFrom")}
              <input
                type="email"
                value={resendFrom}
                onChange={(e) => setResendFrom(e.target.value)}
                placeholder="noreply@example.com"
                className={INPUT_CLASS}
              />
            </label>
          </>
        )}

        {emailProvider === "smtp" && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <label className="col-span-2 block text-sm text-gray-700">
                {t("admin.settings.smtpHost")}
                <input
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.example.com"
                  className={INPUT_CLASS}
                />
              </label>
              <label className="block text-sm text-gray-700">
                {t("admin.settings.smtpPort")}
                <input
                  type="number"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  className={INPUT_CLASS}
                />
              </label>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={smtpSecure}
                onChange={(e) => setSmtpSecure(e.target.checked)}
                className="rounded border-gray-300"
              />
              {t("admin.settings.smtpSecure")}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-gray-700">
                {t("admin.settings.smtpUser")}
                <input
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  className={INPUT_CLASS}
                />
              </label>
              <label className="block text-sm text-gray-700">
                {t("admin.settings.smtpPass")}
                <input
                  type="password"
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  autoComplete="off"
                  className={INPUT_CLASS}
                />
              </label>
            </div>
            <label className="block text-sm text-gray-700">
              {t("admin.settings.emailFrom")}
              <input
                type="email"
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
                placeholder="noreply@example.com"
                className={INPUT_CLASS}
              />
            </label>
          </>
        )}

        <SettingsSaveButton saving={saving} onClick={() => void handleSave()} />
      </div>
    </SettingsSectionShell>
  );
}
