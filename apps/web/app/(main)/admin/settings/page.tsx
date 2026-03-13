"use client";

import { adminApi, getSiteIconUrl, type EmailProvider, type LlmProvider, type StorageProviderType } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import { useStableEvent } from "@/lib/use-stable-event";
import { useEffect, useRef, useState } from "react";

const SITE_ICON_MAX_BYTES = 256 * 1024;
const SITE_ICON_ALLOWED_EXTENSIONS = [".png", ".svg", ".ico"];

export default function AdminSettingsPage() {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();

  // Site settings
  const [siteTitle, setSiteTitle] = useState("");
  const [siteTagline, setSiteTagline] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Site icon
  const [hasSiteIcon, setHasSiteIcon] = useState(false);
  const [iconUploading, setIconUploading] = useState(false);
  const [iconRemoving, setIconRemoving] = useState(false);
  const [iconError, setIconError] = useState<string | null>(null);
  const [iconNotice, setIconNotice] = useState<string | null>(null);
  const [iconVersion, setIconVersion] = useState(Date.now());
  const [iconDragging, setIconDragging] = useState(false);
  const iconInputRef = useRef<HTMLInputElement>(null);

  // Meeting video quality settings
  const [mtgSimulcast, setMtgSimulcast] = useState(true);
  const [mtgDynacast, setMtgDynacast] = useState(true);
  const [mtgAdaptiveStream, setMtgAdaptiveStream] = useState(true);
  const [mtgVideoSaving, setMtgVideoSaving] = useState(false);
  const [mtgVideoError, setMtgVideoError] = useState<string | null>(null);
  const [mtgVideoNotice, setMtgVideoNotice] = useState<string | null>(null);

  // Coworking video quality settings
  const [cwSimulcast, setCwSimulcast] = useState(true);
  const [cwDynacast, setCwDynacast] = useState(true);
  const [cwAdaptiveStream, setCwAdaptiveStream] = useState(true);
  const [cwVideoSaving, setCwVideoSaving] = useState(false);
  const [cwVideoError, setCwVideoError] = useState<string | null>(null);
  const [cwVideoNotice, setCwVideoNotice] = useState<string | null>(null);

  // Email settings
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

  // LLM provider settings
  const [llmProvider, setLlmProvider] = useState<LlmProvider>("google");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiTextModel, setGeminiTextModel] = useState("");
  const [vertexProject, setVertexProject] = useState("");
  const [vertexLocation, setVertexLocation] = useState("");
  const [vertexModel, setVertexModel] = useState("");
  const [zhipuApiKey, setZhipuApiKey] = useState("");
  const [zhipuTextModel, setZhipuTextModel] = useState("");
  const [llmLoading, setLlmLoading] = useState(true);
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [llmNotice, setLlmNotice] = useState<string | null>(null);

  // Storage provider settings
  const [storageProvider, setStorageProvider] = useState<StorageProviderType>("local");
  const [storageLocalPath, setStorageLocalPath] = useState("");
  const [storageS3Endpoint, setStorageS3Endpoint] = useState("");
  const [storageS3Region, setStorageS3Region] = useState("");
  const [storageS3Bucket, setStorageS3Bucket] = useState("");
  const [storageS3AccessKey, setStorageS3AccessKey] = useState("");
  const [storageS3SecretKey, setStorageS3SecretKey] = useState("");
  const [storageS3ForcePathStyle, setStorageS3ForcePathStyle] = useState(true);
  const [storageGcsBucket, setStorageGcsBucket] = useState("");
  const [storageGcsProjectId, setStorageGcsProjectId] = useState("");
  const [storageGcsKeyJson, setStorageGcsKeyJson] = useState("");
  const [storageLoading, setStorageLoading] = useState(true);
  const [storageSaving, setStorageSaving] = useState(false);
  const [storageTesting, setStorageTesting] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);

  const loadSettings = useStableEvent(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminApi.getSiteSettings();
      setSiteTitle(data.siteTitle ?? "");
      setSiteTagline(data.siteTagline ?? "");
      setMtgSimulcast(data.livekitMeetingSimulcast ?? true);
      setMtgDynacast(data.livekitMeetingDynacast ?? true);
      setMtgAdaptiveStream(data.livekitMeetingAdaptiveStream ?? true);
      setCwSimulcast(data.livekitCoworkingSimulcast ?? true);
      setCwDynacast(data.livekitCoworkingDynacast ?? true);
      setCwAdaptiveStream(data.livekitCoworkingAdaptiveStream ?? true);
      setHasSiteIcon(data.hasSiteIcon ?? false);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, t("admin.settings.loadError")));
    } finally {
      setIsLoading(false);
    }
  });

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

  const loadLlmSettings = useStableEvent(async () => {
    setLlmLoading(true);
    setLlmError(null);
    try {
      const data = await adminApi.getLlmSettings();
      setLlmProvider(data.provider);
      setGeminiApiKey(data.geminiApiKey ?? "");
      setGeminiTextModel(data.geminiTextModel ?? "");
      setVertexProject(data.vertexProject ?? "");
      setVertexLocation(data.vertexLocation ?? "");
      setVertexModel(data.vertexModel ?? "");
      setZhipuApiKey(data.zhipuApiKey ?? "");
      setZhipuTextModel(data.zhipuTextModel ?? "");
    } catch (loadError) {
      setLlmError(getApiErrorMessage(loadError, t("admin.settings.loadError")));
    } finally {
      setLlmLoading(false);
    }
  });

  const loadStorageSettings = useStableEvent(async () => {
    setStorageLoading(true);
    setStorageError(null);
    try {
      const data = await adminApi.getStorageSettings();
      setStorageProvider(data.provider);
      setStorageLocalPath(data.localPath ?? "");
      setStorageS3Endpoint(data.s3Endpoint ?? "");
      setStorageS3Region(data.s3Region ?? "");
      setStorageS3Bucket(data.s3Bucket ?? "");
      setStorageS3AccessKey(data.s3AccessKey ?? "");
      setStorageS3SecretKey(data.s3SecretKey ?? "");
      setStorageS3ForcePathStyle(data.s3ForcePathStyle);
      setStorageGcsBucket(data.gcsBucket ?? "");
      setStorageGcsProjectId(data.gcsProjectId ?? "");
      setStorageGcsKeyJson(data.gcsKeyJson ?? "");
    } catch (loadError) {
      setStorageError(getApiErrorMessage(loadError, t("admin.settings.loadError")));
    } finally {
      setStorageLoading(false);
    }
  });

  useEffect(() => {
    void loadSettings();
    void loadEmailSettings();
    void loadLlmSettings();
    void loadStorageSettings();
  }, [loadSettings, loadEmailSettings, loadLlmSettings, loadStorageSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await adminApi.updateSiteSettings({ siteTitle, siteTagline });
      setNotice(t("admin.settings.updated"));
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, t("admin.settings.saveError")));
    } finally {
      setIsSaving(false);
    }
  };

  const handleMtgVideoSave = async () => {
    setMtgVideoSaving(true);
    setMtgVideoError(null);
    setMtgVideoNotice(null);
    try {
      await adminApi.updateSiteSettings({
        livekitMeetingSimulcast: mtgSimulcast,
        livekitMeetingDynacast: mtgDynacast,
        livekitMeetingAdaptiveStream: mtgAdaptiveStream,
      });
      setMtgVideoNotice(t("admin.settings.updated"));
    } catch (saveError) {
      setMtgVideoError(getApiErrorMessage(saveError, t("admin.settings.saveError")));
    } finally {
      setMtgVideoSaving(false);
    }
  };

  const handleCwVideoSave = async () => {
    setCwVideoSaving(true);
    setCwVideoError(null);
    setCwVideoNotice(null);
    try {
      await adminApi.updateSiteSettings({
        livekitCoworkingSimulcast: cwSimulcast,
        livekitCoworkingDynacast: cwDynacast,
        livekitCoworkingAdaptiveStream: cwAdaptiveStream,
      });
      setCwVideoNotice(t("admin.settings.updated"));
    } catch (saveError) {
      setCwVideoError(getApiErrorMessage(saveError, t("admin.settings.saveError")));
    } finally {
      setCwVideoSaving(false);
    }
  };

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

  const handleLlmSave = async () => {
    setLlmSaving(true);
    setLlmError(null);
    setLlmNotice(null);
    try {
      const payload: Record<string, unknown> = { provider: llmProvider };
      if (geminiApiKey && geminiApiKey !== "••••••••") payload.geminiApiKey = geminiApiKey;
      payload.geminiTextModel = geminiTextModel || null;
      payload.vertexProject = vertexProject || null;
      payload.vertexLocation = vertexLocation || null;
      payload.vertexModel = vertexModel || null;
      if (zhipuApiKey && zhipuApiKey !== "••••••••") payload.zhipuApiKey = zhipuApiKey;
      payload.zhipuTextModel = zhipuTextModel || null;
      await adminApi.updateLlmSettings(payload);
      setLlmNotice(t("admin.settings.updated"));
    } catch (saveError) {
      setLlmError(getApiErrorMessage(saveError, t("admin.settings.saveError")));
    } finally {
      setLlmSaving(false);
    }
  };

  const handleLlmTest = async () => {
    setLlmTesting(true);
    setLlmError(null);
    setLlmNotice(null);
    try {
      const result = await adminApi.testLlmConnection();
      if (result.ok) {
        setLlmNotice(t("admin.settings.llmTestSuccess"));
      } else {
        setLlmError(result.error ?? t("admin.settings.llmTestFail"));
      }
    } catch (testError) {
      setLlmError(getApiErrorMessage(testError, t("admin.settings.llmTestFail")));
    } finally {
      setLlmTesting(false);
    }
  };

  const handleStorageSave = async () => {
    setStorageSaving(true);
    setStorageError(null);
    setStorageNotice(null);
    try {
      const payload: Record<string, unknown> = { provider: storageProvider };
      if (storageProvider === "local") {
        payload.localPath = storageLocalPath || null;
      } else if (storageProvider === "s3") {
        payload.s3Endpoint = storageS3Endpoint || null;
        payload.s3Region = storageS3Region || null;
        payload.s3Bucket = storageS3Bucket || null;
        payload.s3AccessKey = storageS3AccessKey || null;
        if (storageS3SecretKey && storageS3SecretKey !== "••••••••") payload.s3SecretKey = storageS3SecretKey;
        payload.s3ForcePathStyle = storageS3ForcePathStyle;
      } else if (storageProvider === "gcs") {
        payload.gcsBucket = storageGcsBucket || null;
        payload.gcsProjectId = storageGcsProjectId || null;
        if (storageGcsKeyJson && storageGcsKeyJson !== "••••••••") payload.gcsKeyJson = storageGcsKeyJson;
      }
      await adminApi.updateStorageSettings(payload);
      setStorageNotice(t("admin.settings.updated"));
    } catch (saveError) {
      setStorageError(getApiErrorMessage(saveError, t("admin.settings.saveError")));
    } finally {
      setStorageSaving(false);
    }
  };

  const handleStorageTest = async () => {
    setStorageTesting(true);
    setStorageError(null);
    setStorageNotice(null);
    try {
      const result = await adminApi.testStorageConnection();
      if (result.ok) {
        setStorageNotice(t("admin.settings.storageTestSuccess"));
      } else {
        setStorageError(result.error ?? t("admin.settings.storageTestFail"));
      }
    } catch (testError) {
      setStorageError(getApiErrorMessage(testError, t("admin.settings.storageTestFail")));
    } finally {
      setStorageTesting(false);
    }
  };

  const handleIconUpload = async (file: File) => {
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (!SITE_ICON_ALLOWED_EXTENSIONS.includes(ext)) {
      setIconError(t("admin.settings.siteIconFormatError"));
      return;
    }
    if (file.size > SITE_ICON_MAX_BYTES) {
      setIconError(t("admin.settings.siteIconSizeError"));
      return;
    }
    setIconUploading(true);
    setIconError(null);
    setIconNotice(null);
    try {
      await adminApi.uploadSiteIcon(file);
      setHasSiteIcon(true);
      setIconVersion(Date.now());

      if (iconInputRef.current) iconInputRef.current.value = "";
      setIconNotice(t("admin.settings.siteIconUpdated"));
    } catch (uploadError) {
      setIconError(getApiErrorMessage(uploadError, t("admin.settings.siteIconUploadError")));
    } finally {
      setIconUploading(false);
    }
  };

  const inputClass = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2";

  return (
    <div className="max-w-2xl space-y-6">
      {/* Site settings */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">{t("admin.settings.siteTitle")}</h2>

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

        {isLoading ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">{t("admin.settings.loading")}</div>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm text-gray-700">
              <span className="inline-flex items-center gap-1">
                {t("admin.settings.siteTitle")}
                <span title={t("admin.settings.siteTitleTooltip")} className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-gray-300 text-[10px] text-gray-400">?</span>
              </span>
              <input value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} className={inputClass} />
            </label>
            <label className="block text-sm text-gray-700">
              <span className="inline-flex items-center gap-1">
                {t("admin.settings.siteTagline")}
                <span title={t("admin.settings.siteTaglineTooltip")} className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-gray-300 text-[10px] text-gray-400">?</span>
              </span>
              <input value={siteTagline} onChange={(e) => setSiteTagline(e.target.value)} className={inputClass} />
            </label>
            <button type="button" onClick={() => void handleSave()} disabled={isSaving} className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60">
              {isSaving ? t("admin.settings.saving") : t("admin.settings.save")}
            </button>
          </div>
        )}
      </section>

      {/* Site icon */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">{t("admin.settings.siteIcon")}</h2>
        <p className="mb-4 text-sm text-gray-500">{t("admin.settings.siteIconDescription")}</p>

        {iconError ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{iconError}</div>
        ) : null}
        {iconNotice ? (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{iconNotice}</div>
        ) : null}

        <div className="space-y-4">
          {hasSiteIcon && (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${getSiteIconUrl()}?v=${iconVersion}`} alt="Site icon" className="h-10 w-10 rounded border border-gray-200 object-contain" />
              <span className="text-sm text-gray-500">{t("admin.settings.siteIcon")}</span>
            </div>
          )}

          {/* Drop zone + file input */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIconDragging(true); }}
            onDragLeave={() => setIconDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIconDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) {

                void handleIconUpload(file);
              }
            }}
            onClick={() => iconInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
              iconDragging
                ? "border-blue-400 bg-blue-50"
                : "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100"
            }`}
          >
            <input
              ref={iconInputRef}
              type="file"
              accept={SITE_ICON_ALLOWED_EXTENSIONS.join(",")}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;

                if (file) void handleIconUpload(file);
              }}
              className="hidden"
            />
            {iconUploading ? (
              <span className="text-sm text-blue-600">{t("admin.settings.siteIconUploading")}</span>
            ) : (
              <>
                <span className="text-sm font-medium text-gray-600">{t("admin.settings.siteIconDropHint")}</span>
                <span className="mt-1 text-xs text-gray-400">PNG / SVG / ICO, max 256KB</span>
              </>
            )}
          </div>

          {hasSiteIcon && (
            <button
              type="button"
              disabled={iconRemoving}
              onClick={async () => {
                setIconRemoving(true);
                setIconError(null);
                setIconNotice(null);
                try {
                  await adminApi.deleteSiteIcon();
                  setHasSiteIcon(false);
                  setIconNotice(t("admin.settings.siteIconRemoved"));
                } catch (removeError) {
                  setIconError(getApiErrorMessage(removeError, t("admin.settings.siteIconRemoveError")));
                } finally {
                  setIconRemoving(false);
                }
              }}
              className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              {iconRemoving ? t("admin.settings.siteIconRemoving") : t("admin.settings.siteIconRemove")}
            </button>
          )}
        </div>
      </section>

      {/* Email settings */}
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
              <select value={emailProvider} onChange={(e) => setEmailProvider(e.target.value as EmailProvider)} className={`${inputClass} cursor-pointer`}>
                <option value="none">{t("admin.settings.emailProviderNone")}</option>
                <option value="resend">Resend</option>
                <option value="smtp">SMTP</option>
              </select>
            </label>

            {emailProvider === "resend" && (
              <>
                <label className="block text-sm text-gray-700">
                  API Key
                  <input type="password" value={resendApiKey} onChange={(e) => setResendApiKey(e.target.value)} placeholder="re_..." className={inputClass} />
                </label>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.emailFrom")}
                  <input type="email" value={resendFrom} onChange={(e) => setResendFrom(e.target.value)} placeholder="noreply@example.com" className={inputClass} />
                </label>
              </>
            )}

            {emailProvider === "smtp" && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <label className="col-span-2 block text-sm text-gray-700">
                    {t("admin.settings.smtpHost")}
                    <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" className={inputClass} />
                  </label>
                  <label className="block text-sm text-gray-700">
                    {t("admin.settings.smtpPort")}
                    <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} className={inputClass} />
                  </label>
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)} className="rounded border-gray-300" />
                  {t("admin.settings.smtpSecure")}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm text-gray-700">
                    {t("admin.settings.smtpUser")}
                    <input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} className={inputClass} />
                  </label>
                  <label className="block text-sm text-gray-700">
                    {t("admin.settings.smtpPass")}
                    <input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} className={inputClass} />
                  </label>
                </div>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.emailFrom")}
                  <input type="email" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="noreply@example.com" className={inputClass} />
                </label>
              </>
            )}

            <button type="button" onClick={() => void handleEmailSave()} disabled={emailSaving} className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60">
              {emailSaving ? t("admin.settings.saving") : t("admin.settings.save")}
            </button>
          </div>
        )}
      </section>
      {/* LLM provider settings */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">{t("admin.settings.llmTitle")}</h2>
        <p className="mb-4 text-sm text-gray-500">{t("admin.settings.llmDescription")}</p>

        {llmError ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <span>{llmError}</span>
            <button type="button" onClick={() => void loadLlmSettings()} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
              {t("common.actions.retry")}
            </button>
          </div>
        ) : null}
        {llmNotice ? (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{llmNotice}</div>
        ) : null}

        {llmLoading ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">{t("admin.settings.loading")}</div>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm text-gray-700">
              {t("admin.settings.llmProvider")}
              <select value={llmProvider} onChange={(e) => setLlmProvider(e.target.value as LlmProvider)} className={`${inputClass} cursor-pointer`}>
                <option value="google">{t("common.providerGoogle")}</option>
                <option value="vertex">{t("common.providerVertex")}</option>
                <option value="zhipu">{t("common.providerZhipu")}</option>
              </select>
            </label>

            {llmProvider === "google" && (
              <>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.llmGeminiApiKey")}
                  <input type="password" value={geminiApiKey} onChange={(e) => setGeminiApiKey(e.target.value)} placeholder="AIza..." className={inputClass} />
                </label>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.llmGeminiModel")}
                  <input value={geminiTextModel} onChange={(e) => setGeminiTextModel(e.target.value)} placeholder="gemini-1.5-flash" className={inputClass} />
                </label>
              </>
            )}

            {llmProvider === "vertex" && (
              <>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.llmVertexProject")}
                  <input value={vertexProject} onChange={(e) => setVertexProject(e.target.value)} placeholder="my-gcp-project" className={inputClass} />
                </label>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.llmVertexLocation")}
                  <input value={vertexLocation} onChange={(e) => setVertexLocation(e.target.value)} placeholder="asia-northeast1" className={inputClass} />
                </label>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.llmVertexModel")}
                  <input value={vertexModel} onChange={(e) => setVertexModel(e.target.value)} placeholder="gemini-1.5-flash" className={inputClass} />
                </label>
                <p className="text-xs text-gray-500">{t("admin.settings.llmVertexAdcHint")}</p>
              </>
            )}

            {llmProvider === "zhipu" && (
              <>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.llmZhipuApiKey")}
                  <input type="password" value={zhipuApiKey} onChange={(e) => setZhipuApiKey(e.target.value)} className={inputClass} />
                </label>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.llmZhipuModel")}
                  <input value={zhipuTextModel} onChange={(e) => setZhipuTextModel(e.target.value)} placeholder="glm-5" className={inputClass} />
                </label>
              </>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={() => void handleLlmSave()} disabled={llmSaving} className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60">
                {llmSaving ? t("admin.settings.saving") : t("admin.settings.save")}
              </button>
              <button type="button" onClick={() => void handleLlmTest()} disabled={llmTesting || llmSaving} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                {llmTesting ? t("admin.settings.llmTesting") : t("admin.settings.llmTest")}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Meeting video quality */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">{t("admin.settings.meetingVideoTitle")}</h2>
        <p className="mb-4 text-sm text-gray-500">{t("admin.settings.meetingVideoDescription")}</p>
        {mtgVideoError ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{mtgVideoError}</div> : null}
        {mtgVideoNotice ? <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{mtgVideoNotice}</div> : null}
        <div className="space-y-3">
          <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
            <input type="checkbox" checked={mtgSimulcast} onChange={(e) => setMtgSimulcast(e.target.checked)} className="mt-0.5 rounded border-gray-300" />
            <div><div className="font-medium">{t("admin.settings.simulcast")}</div><div className="mt-0.5 text-xs text-gray-500">{t("admin.settings.simulcastHint")}</div></div>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
            <input type="checkbox" checked={mtgDynacast} onChange={(e) => setMtgDynacast(e.target.checked)} className="mt-0.5 rounded border-gray-300" />
            <div><div className="font-medium">{t("admin.settings.dynacast")}</div><div className="mt-0.5 text-xs text-gray-500">{t("admin.settings.dynacastHint")}</div></div>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
            <input type="checkbox" checked={mtgAdaptiveStream} onChange={(e) => setMtgAdaptiveStream(e.target.checked)} className="mt-0.5 rounded border-gray-300" />
            <div><div className="font-medium">{t("admin.settings.adaptiveStream")}</div><div className="mt-0.5 text-xs text-gray-500">{t("admin.settings.adaptiveStreamHint")}</div></div>
          </label>
          <button type="button" onClick={() => void handleMtgVideoSave()} disabled={mtgVideoSaving} className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60">
            {mtgVideoSaving ? t("admin.settings.saving") : t("admin.settings.save")}
          </button>
        </div>
      </section>

      {/* Coworking video quality */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">{t("admin.settings.coworkingVideoTitle")}</h2>
        <p className="mb-4 text-sm text-gray-500">{t("admin.settings.coworkingVideoDescription")}</p>
        {cwVideoError ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{cwVideoError}</div> : null}
        {cwVideoNotice ? <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{cwVideoNotice}</div> : null}
        <div className="space-y-3">
          <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
            <input type="checkbox" checked={cwSimulcast} onChange={(e) => setCwSimulcast(e.target.checked)} className="mt-0.5 rounded border-gray-300" />
            <div><div className="font-medium">{t("admin.settings.simulcast")}</div><div className="mt-0.5 text-xs text-gray-500">{t("admin.settings.simulcastHint")}</div></div>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
            <input type="checkbox" checked={cwDynacast} onChange={(e) => setCwDynacast(e.target.checked)} className="mt-0.5 rounded border-gray-300" />
            <div><div className="font-medium">{t("admin.settings.dynacast")}</div><div className="mt-0.5 text-xs text-gray-500">{t("admin.settings.dynacastHint")}</div></div>
          </label>
          <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
            <input type="checkbox" checked={cwAdaptiveStream} onChange={(e) => setCwAdaptiveStream(e.target.checked)} className="mt-0.5 rounded border-gray-300" />
            <div><div className="font-medium">{t("admin.settings.adaptiveStream")}</div><div className="mt-0.5 text-xs text-gray-500">{t("admin.settings.adaptiveStreamHint")}</div></div>
          </label>
          <button type="button" onClick={() => void handleCwVideoSave()} disabled={cwVideoSaving} className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60">
            {cwVideoSaving ? t("admin.settings.saving") : t("admin.settings.save")}
          </button>
        </div>
      </section>
      {/* Storage Provider */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">{t("admin.settings.storageTitle")}</h2>
        <p className="mb-4 text-sm text-gray-500">{t("admin.settings.storageDescription")}</p>

        {storageError ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <span>{storageError}</span>
            <button type="button" onClick={() => void loadStorageSettings()} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
              {t("common.actions.retry")}
            </button>
          </div>
        ) : null}
        {storageNotice ? (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{storageNotice}</div>
        ) : null}

        {storageLoading ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">{t("admin.settings.loading")}</div>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm text-gray-700">
              {t("admin.settings.storageProvider")}
              <select value={storageProvider} onChange={(e) => setStorageProvider(e.target.value as StorageProviderType)} className={`${inputClass} cursor-pointer`}>
                <option value="local">{t("admin.settings.storageLocal")}</option>
                <option value="s3">{t("admin.settings.storageS3")}</option>
                <option value="gcs">{t("admin.settings.storageGcs")}</option>
              </select>
            </label>

            {storageProvider === "local" && (
              <label className="block text-sm text-gray-700">
                {t("admin.settings.storageLocalPath")}
                <input value={storageLocalPath} onChange={(e) => setStorageLocalPath(e.target.value)} placeholder="/data/files" className={inputClass} />
              </label>
            )}

            {storageProvider === "s3" && (
              <>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.storageS3Endpoint")}
                  <input value={storageS3Endpoint} onChange={(e) => setStorageS3Endpoint(e.target.value)} placeholder="https://s3.amazonaws.com" className={inputClass} />
                </label>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.storageS3Region")}
                  <input value={storageS3Region} onChange={(e) => setStorageS3Region(e.target.value)} placeholder="us-east-1" className={inputClass} />
                </label>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.storageS3Bucket")}
                  <input value={storageS3Bucket} onChange={(e) => setStorageS3Bucket(e.target.value)} placeholder="my-bucket" className={inputClass} />
                </label>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.storageS3AccessKey")}
                  <input value={storageS3AccessKey} onChange={(e) => setStorageS3AccessKey(e.target.value)} placeholder="AKIA..." className={inputClass} />
                </label>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.storageS3SecretKey")}
                  <input type="password" value={storageS3SecretKey} onChange={(e) => setStorageS3SecretKey(e.target.value)} className={inputClass} />
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
                  <input type="checkbox" checked={storageS3ForcePathStyle} onChange={(e) => setStorageS3ForcePathStyle(e.target.checked)} className="mt-0.5 rounded border-gray-300" />
                  <div>
                    <div className="font-medium">{t("admin.settings.storageS3ForcePathStyle")}</div>
                    <div className="mt-0.5 text-xs text-gray-500">{t("admin.settings.storageS3ForcePathStyleHint")}</div>
                  </div>
                </label>
              </>
            )}

            {storageProvider === "gcs" && (
              <>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.storageGcsBucket")}
                  <input value={storageGcsBucket} onChange={(e) => setStorageGcsBucket(e.target.value)} placeholder="my-bucket" className={inputClass} />
                </label>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.storageGcsProjectId")}
                  <input value={storageGcsProjectId} onChange={(e) => setStorageGcsProjectId(e.target.value)} placeholder="my-gcp-project" className={inputClass} />
                </label>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.storageGcsKeyJson")}
                  <textarea value={storageGcsKeyJson} onChange={(e) => setStorageGcsKeyJson(e.target.value)} rows={4} placeholder='{"type":"service_account",...}' className={inputClass} />
                </label>
              </>
            )}

            <div className="flex gap-3">
              <button type="button" onClick={() => void handleStorageSave()} disabled={storageSaving} className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60">
                {storageSaving ? t("admin.settings.saving") : t("admin.settings.save")}
              </button>
              <button type="button" onClick={() => void handleStorageTest()} disabled={storageTesting || storageSaving} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">
                {storageTesting ? t("admin.settings.testing") : t("admin.settings.testConnection")}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
