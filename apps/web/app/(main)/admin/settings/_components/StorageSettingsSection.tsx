"use client";

import { useState } from "react";
import { adminApi, type StorageProviderType } from "@/lib/api";
import { useSettingsForm } from "@/lib/hooks/use-settings-form";
import { useT } from "@/lib/i18n";
import {
  INPUT_CLASS,
  SettingsCheckbox,
  SettingsSaveButton,
  SettingsSectionShell,
} from "./SettingsSectionShell";
import type { TestModalState } from "./TestConnectionModal";
import { useConnectionTest } from "./use-connection-test";

interface StorageSettingsSectionProps {
  onTestModal: (modal: TestModalState | null) => void;
}

export function StorageSettingsSection({ onTestModal }: StorageSettingsSectionProps) {
  const t = useT();

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
  const { loading, saving, error, notice, loadSettings, handleSave, setError, setNotice } =
    useSettingsForm({
      load: () => adminApi.getStorageSettings(),
      onLoaded: (data) => {
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
      },
      save: async () => {
        const payload: Record<string, unknown> = { provider: storageProvider };
        if (storageProvider === "local") {
          payload.localPath = storageLocalPath || null;
        } else if (storageProvider === "s3") {
          payload.s3Endpoint = storageS3Endpoint || null;
          payload.s3Region = storageS3Region || null;
          payload.s3Bucket = storageS3Bucket || null;
          payload.s3AccessKey = storageS3AccessKey || null;
          if (storageS3SecretKey && storageS3SecretKey !== "••••••••")
            payload.s3SecretKey = storageS3SecretKey;
          payload.s3ForcePathStyle = storageS3ForcePathStyle;
        } else if (storageProvider === "gcs") {
          payload.gcsBucket = storageGcsBucket || null;
          payload.gcsUseGcpDefaults = storageGcsUseGcpDefaults;
          if (!storageGcsUseGcpDefaults) {
            payload.gcsProjectId = storageGcsProjectId || null;
            if (storageGcsKeyJson && storageGcsKeyJson !== "••••••••")
              payload.gcsKeyJson = storageGcsKeyJson;
          }
        }
        await adminApi.updateStorageSettings(payload);
      },
    });

  const { testing: storageTesting, handleTest: handleStorageTest } = useConnectionTest({
    title: t("admin.settings.storageTestTitle"),
    test: async () => {
      const result = await adminApi.testStorageConnection();
      return {
        ok: result.ok,
        message: result.provider
          ? `${t("admin.settings.storageTestSuccess")} (${result.provider})`
          : t("admin.settings.storageTestSuccess"),
        error: result.error,
      };
    },
    setError,
    setNotice,
    onTestModal,
    testingMessage: t("admin.settings.testing"),
    failMessage: t("admin.settings.storageTestFail"),
  });

  return (
    <SettingsSectionShell
      title={t("admin.settings.storageTitle")}
      description={t("admin.settings.storageDescription")}
      error={error}
      notice={notice}
      loading={loading}
      onRetry={() => void loadSettings()}
    >
      <div className="space-y-4">
        <label className="block text-sm text-gray-700">
          {t("admin.settings.storageProvider")}
          <select
            value={storageProvider}
            onChange={(e) => setStorageProvider(e.target.value as StorageProviderType)}
            className={`${INPUT_CLASS} cursor-pointer`}
          >
            <option value="local">{t("admin.settings.storageLocal")}</option>
            <option value="s3">{t("admin.settings.storageS3")}</option>
            <option value="gcs">{t("admin.settings.storageGcs")}</option>
          </select>
        </label>

        {storageProvider === "local" && (
          <label className="block text-sm text-gray-700">
            {t("admin.settings.storageLocalPath")}
            <input
              value={storageLocalPath}
              onChange={(e) => setStorageLocalPath(e.target.value)}
              placeholder="/data/files"
              className={INPUT_CLASS}
            />
          </label>
        )}

        {storageProvider === "s3" && (
          <>
            <label className="block text-sm text-gray-700">
              {t("admin.settings.storageS3Endpoint")}
              <input
                value={storageS3Endpoint}
                onChange={(e) => setStorageS3Endpoint(e.target.value)}
                placeholder="https://s3.amazonaws.com"
                className={INPUT_CLASS}
              />
            </label>
            <label className="block text-sm text-gray-700">
              {t("admin.settings.storageS3Region")}
              <input
                value={storageS3Region}
                onChange={(e) => setStorageS3Region(e.target.value)}
                placeholder="us-east-1"
                className={INPUT_CLASS}
              />
            </label>
            <label className="block text-sm text-gray-700">
              {t("admin.settings.storageS3Bucket")}
              <input
                value={storageS3Bucket}
                onChange={(e) => setStorageS3Bucket(e.target.value)}
                placeholder="my-bucket"
                className={INPUT_CLASS}
              />
            </label>
            <label className="block text-sm text-gray-700">
              {t("admin.settings.storageS3AccessKey")}
              <input
                value={storageS3AccessKey}
                onChange={(e) => setStorageS3AccessKey(e.target.value)}
                placeholder="AKIA..."
                className={INPUT_CLASS}
              />
            </label>
            <label className="block text-sm text-gray-700">
              {t("admin.settings.storageS3SecretKey")}
              <input
                type="password"
                value={storageS3SecretKey}
                onChange={(e) => setStorageS3SecretKey(e.target.value)}
                autoComplete="off"
                className={INPUT_CLASS}
              />
            </label>
            <SettingsCheckbox
              checked={storageS3ForcePathStyle}
              onChange={setStorageS3ForcePathStyle}
              label={t("admin.settings.storageS3ForcePathStyle")}
              hint={t("admin.settings.storageS3ForcePathStyleHint")}
            />
          </>
        )}

        {storageProvider === "gcs" && (
          <>
            <label className="block text-sm text-gray-700">
              {t("admin.settings.storageGcsBucket")}
              <input
                value={storageGcsBucket}
                onChange={(e) => setStorageGcsBucket(e.target.value)}
                placeholder="my-bucket"
                className={INPUT_CLASS}
              />
            </label>
            <SettingsCheckbox
              checked={storageGcsUseGcpDefaults}
              onChange={setStorageGcsUseGcpDefaults}
              label={t("admin.settings.storageGcsUseDefaults")}
              hint={t("admin.settings.storageGcsUseDefaultsHint")}
            />
            {!storageGcsUseGcpDefaults && (
              <>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.storageGcsProjectId")}
                  <input
                    value={storageGcsProjectId}
                    onChange={(e) => setStorageGcsProjectId(e.target.value)}
                    placeholder="my-gcp-project"
                    className={INPUT_CLASS}
                  />
                </label>
                <label className="block text-sm text-gray-700">
                  {t("admin.settings.storageGcsKeyJson")}
                  <textarea
                    value={storageGcsKeyJson}
                    onChange={(e) => setStorageGcsKeyJson(e.target.value)}
                    rows={4}
                    placeholder='{"type":"service_account",...}'
                    className={INPUT_CLASS}
                  />
                </label>
              </>
            )}
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
            onClick={() => void handleStorageTest()}
            disabled={storageTesting || saving}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {storageTesting ? t("admin.settings.testing") : t("admin.settings.testConnection")}
          </button>
        </div>
      </div>
    </SettingsSectionShell>
  );
}
