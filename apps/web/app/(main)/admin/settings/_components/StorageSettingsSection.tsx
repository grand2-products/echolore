"use client";

import { adminApi, type StorageProviderType } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import { useStableEvent } from "@/lib/use-stable-event";
import { useEffect, useState } from "react";
import { type TestModalState } from "./TestConnectionModal";

const INPUT_CLASS = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2";

interface StorageSettingsSectionProps {
  onTestModal: (modal: TestModalState | null) => void;
}

export function StorageSettingsSection({ onTestModal }: StorageSettingsSectionProps) {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();

  const [storageProvider, setStorageProvider] = useState<StorageProviderType>("local");
  const [storageLocalPath, setStorageLocalPath] = useState("");
  const [storageS3Endpoint, setStorageS3Endpoint] = useState("");
  const [storageS3Region, setStorageS3Region] = useState("");
  const [storageS3Bucket, setStorageS3Bucket] = useState("");
  const [storageS3AccessKey, setStorageS3AccessKey] = useState("");
  const [storageS3SecretKey, setStorageS3SecretKey] = useState("");
  const [storageS3ForcePathStyle, setStorageS3ForcePathStyle] = useState(true);
  const [storageGcsBucket, setStorageGcsBucket] = useState("");
  const [storageGcsUseGcpDefaults, setStorageGcsUseGcpDefaults] = useState(true);
  const [storageGcsProjectId, setStorageGcsProjectId] = useState("");
  const [storageGcsKeyJson, setStorageGcsKeyJson] = useState("");
  const [storageLoading, setStorageLoading] = useState(true);
  const [storageSaving, setStorageSaving] = useState(false);
  const [storageTesting, setStorageTesting] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);

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
      setStorageGcsUseGcpDefaults(data.gcsUseGcpDefaults ?? true);
      setStorageGcsProjectId(data.gcsProjectId ?? "");
      setStorageGcsKeyJson(data.gcsKeyJson ?? "");
    } catch (loadError) {
      setStorageError(getApiErrorMessage(loadError, t("admin.settings.loadError")));
    } finally {
      setStorageLoading(false);
    }
  });

  useEffect(() => {
    void loadStorageSettings();
  }, [loadStorageSettings]);

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
        payload.gcsUseGcpDefaults = storageGcsUseGcpDefaults;
        if (!storageGcsUseGcpDefaults) {
          payload.gcsProjectId = storageGcsProjectId || null;
          if (storageGcsKeyJson && storageGcsKeyJson !== "••••••••") payload.gcsKeyJson = storageGcsKeyJson;
        }
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
    onTestModal({ title: t("admin.settings.storageTestTitle"), status: "loading", message: t("admin.settings.testing") });
    try {
      const result = await adminApi.testStorageConnection();
      if (result.ok) {
        onTestModal({
          title: t("admin.settings.storageTestTitle"),
          status: "success",
          message: result.provider
            ? `${t("admin.settings.storageTestSuccess")} (${result.provider})`
            : t("admin.settings.storageTestSuccess"),
        });
      } else {
        onTestModal({
          title: t("admin.settings.storageTestTitle"),
          status: "error",
          message: result.error ?? t("admin.settings.storageTestFail"),
        });
      }
    } catch (testError) {
      onTestModal({
        title: t("admin.settings.storageTestTitle"),
        status: "error",
        message: getApiErrorMessage(testError, t("admin.settings.storageTestFail")),
      });
    } finally {
      setStorageTesting(false);
    }
  };

  return (
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
            <select value={storageProvider} onChange={(e) => setStorageProvider(e.target.value as StorageProviderType)} className={`${INPUT_CLASS} cursor-pointer`}>
              <option value="local">{t("admin.settings.storageLocal")}</option>
              <option value="s3">{t("admin.settings.storageS3")}</option>
              <option value="gcs">{t("admin.settings.storageGcs")}</option>
            </select>
          </label>

          {storageProvider === "local" && (
            <label className="block text-sm text-gray-700">
              {t("admin.settings.storageLocalPath")}
              <input value={storageLocalPath} onChange={(e) => setStorageLocalPath(e.target.value)} placeholder="/data/files" className={INPUT_CLASS} />
            </label>
          )}

          {storageProvider === "s3" && (
            <>
              <label className="block text-sm text-gray-700">
                {t("admin.settings.storageS3Endpoint")}
                <input value={storageS3Endpoint} onChange={(e) => setStorageS3Endpoint(e.target.value)} placeholder="https://s3.amazonaws.com" className={INPUT_CLASS} />
              </label>
              <label className="block text-sm text-gray-700">
                {t("admin.settings.storageS3Region")}
                <input value={storageS3Region} onChange={(e) => setStorageS3Region(e.target.value)} placeholder="us-east-1" className={INPUT_CLASS} />
              </label>
              <label className="block text-sm text-gray-700">
                {t("admin.settings.storageS3Bucket")}
                <input value={storageS3Bucket} onChange={(e) => setStorageS3Bucket(e.target.value)} placeholder="my-bucket" className={INPUT_CLASS} />
              </label>
              <label className="block text-sm text-gray-700">
                {t("admin.settings.storageS3AccessKey")}
                <input value={storageS3AccessKey} onChange={(e) => setStorageS3AccessKey(e.target.value)} placeholder="AKIA..." className={INPUT_CLASS} />
              </label>
              <label className="block text-sm text-gray-700">
                {t("admin.settings.storageS3SecretKey")}
                <input type="password" value={storageS3SecretKey} onChange={(e) => setStorageS3SecretKey(e.target.value)} className={INPUT_CLASS} />
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
                <input value={storageGcsBucket} onChange={(e) => setStorageGcsBucket(e.target.value)} placeholder="my-bucket" className={INPUT_CLASS} />
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
                <input type="checkbox" checked={storageGcsUseGcpDefaults} onChange={(e) => setStorageGcsUseGcpDefaults(e.target.checked)} className="mt-0.5 rounded border-gray-300" />
                <div>
                  <div className="font-medium">{t("admin.settings.storageGcsUseDefaults")}</div>
                  <div className="mt-0.5 text-xs text-gray-500">{t("admin.settings.storageGcsUseDefaultsHint")}</div>
                </div>
              </label>
              {!storageGcsUseGcpDefaults && (
                <>
                  <label className="block text-sm text-gray-700">
                    {t("admin.settings.storageGcsProjectId")}
                    <input value={storageGcsProjectId} onChange={(e) => setStorageGcsProjectId(e.target.value)} placeholder="my-gcp-project" className={INPUT_CLASS} />
                  </label>
                  <label className="block text-sm text-gray-700">
                    {t("admin.settings.storageGcsKeyJson")}
                    <textarea value={storageGcsKeyJson} onChange={(e) => setStorageGcsKeyJson(e.target.value)} rows={4} placeholder='{"type":"service_account",...}' className={INPUT_CLASS} />
                  </label>
                </>
              )}
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
  );
}
