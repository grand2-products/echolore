"use client";

import { useState } from "react";
import { adminApi, type StorageProviderType } from "@/lib/api";
import { useSettingsForm } from "@/lib/hooks/use-settings-form";
import { useT } from "@/lib/i18n";
import { GcsFieldGroup } from "./GcsFieldGroup";
import { S3FieldGroup } from "./S3FieldGroup";
import { INPUT_CLASS, SettingsSaveButton, SettingsSectionShell } from "./SettingsSectionShell";
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

  const buildTestPayload = (): Record<string, unknown> => {
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
    return payload;
  };

  const { testing: storageTesting, handleTest: handleStorageTest } = useConnectionTest({
    title: t("admin.settings.storageTestTitle"),
    test: async () => {
      const result = await adminApi.testStorageConnection(buildTestPayload());
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
          <S3FieldGroup
            endpoint={storageS3Endpoint}
            onEndpointChange={setStorageS3Endpoint}
            region={storageS3Region}
            onRegionChange={setStorageS3Region}
            bucket={storageS3Bucket}
            onBucketChange={setStorageS3Bucket}
            accessKey={storageS3AccessKey}
            onAccessKeyChange={setStorageS3AccessKey}
            secretKey={storageS3SecretKey}
            onSecretKeyChange={setStorageS3SecretKey}
            forcePathStyle={storageS3ForcePathStyle}
            onForcePathStyleChange={setStorageS3ForcePathStyle}
          />
        )}

        {storageProvider === "gcs" && (
          <GcsFieldGroup
            bucket={storageGcsBucket}
            onBucketChange={setStorageGcsBucket}
            useGcpDefaults={storageGcsUseGcpDefaults}
            onUseGcpDefaultsChange={setStorageGcsUseGcpDefaults}
            projectId={storageGcsProjectId}
            onProjectIdChange={setStorageGcsProjectId}
            keyJson={storageGcsKeyJson}
            onKeyJsonChange={setStorageGcsKeyJson}
          />
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
