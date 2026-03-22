"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ModalShell } from "@/components/wiki";
import { adminApi, type BackupProviderType } from "@/lib/api";
import type { BackupHealthStatus, BackupJobStatus, BackupListResponse } from "@/lib/api/types";
import { formatBytes } from "@/lib/format";
import { useSettingsForm } from "@/lib/hooks/use-settings-form";
import { useT } from "@/lib/i18n";
import { GcsFieldGroup } from "./GcsFieldGroup";
import { S3FieldGroup } from "./S3FieldGroup";
import { INPUT_CLASS, SettingsSaveButton, SettingsSectionShell } from "./SettingsSectionShell";
import type { TestModalState } from "./TestConnectionModal";
import { useConnectionTest } from "./use-connection-test";

interface BackupSettingsSectionProps {
  onTestModal: (modal: TestModalState | null) => void;
}

const HEALTH_BADGE: Record<BackupHealthStatus, { label: string; className: string }> = {
  healthy: {
    label: "admin.settings.backupHealthy",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  warning: {
    label: "admin.settings.backupWarning",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  critical: {
    label: "admin.settings.backupCritical",
    className: "border-red-200 bg-red-50 text-red-700",
  },
  unconfigured: {
    label: "admin.settings.backupUnconfigured",
    className: "border-gray-200 bg-gray-50 text-gray-500",
  },
};

const JOB_POLL_INTERVAL = 3000;

export function BackupSettingsSection({ onTestModal }: BackupSettingsSectionProps) {
  const t = useT();

  // Backup list + job status
  const [backupList, setBackupList] = useState<BackupListResponse>({
    backups: [],
    latestAt: null,
    healthStatus: "unconfigured",
  });
  const [listLoading, setListLoading] = useState(true);
  const [jobStatus, setJobStatus] = useState<BackupJobStatus>({
    state: "idle",
    operation: null,
    startedAt: null,
    targetFile: null,
    progressMessage: null,
    error: null,
    completedAt: null,
    lastResult: null,
  });
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);

  // Settings form state
  const [provider, setProvider] = useState<BackupProviderType | "">("");
  const [retentionDays, setRetentionDays] = useState("30");
  const [s3Endpoint, setS3Endpoint] = useState("");
  const [s3Region, setS3Region] = useState("");
  const [s3Bucket, setS3Bucket] = useState("");
  const [s3AccessKey, setS3AccessKey] = useState("");
  const [s3SecretKey, setS3SecretKey] = useState("");
  const [s3ForcePathStyle, setS3ForcePathStyle] = useState(true);
  const [gcsBucket, setGcsBucket] = useState("");
  const [gcsUseGcpDefaults, setGcsUseGcpDefaults] = useState(true);
  const [gcsProjectId, setGcsProjectId] = useState("");
  const [gcsKeyJson, setGcsKeyJson] = useState("");
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");

  const fetchBackupList = useCallback(async () => {
    setListLoading(true);
    try {
      setBackupList(await adminApi.listBackups());
    } catch {
      setBackupList({ backups: [], latestAt: null, healthStatus: "unconfigured" });
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBackupList();
  }, [fetchBackupList]);

  // Poll job status when an operation is running
  const prevStateRef = useRef(jobStatus.state);
  useEffect(() => {
    // Initial status fetch
    void adminApi
      .getBackupJobStatus()
      .then(setJobStatus)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (jobStatus.state === "idle") {
      // If we just transitioned from non-idle to idle, refresh the backup list
      if (prevStateRef.current !== "idle") {
        void fetchBackupList();
      }
      prevStateRef.current = jobStatus.state;
      return;
    }
    prevStateRef.current = jobStatus.state;
    const timer = setInterval(() => {
      void adminApi
        .getBackupJobStatus()
        .then(setJobStatus)
        .catch(() => {});
    }, JOB_POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [jobStatus.state, fetchBackupList]);

  const { loading, saving, error, notice, loadSettings, handleSave, setError, setNotice } =
    useSettingsForm({
      load: () => adminApi.getBackupSettings(),
      onLoaded: (data) => {
        setProvider(data.provider ?? "");
        setRetentionDays(data.retentionDays != null ? String(data.retentionDays) : "30");
        setS3Endpoint(data.s3Endpoint ?? "");
        setS3Region(data.s3Region ?? "");
        setS3Bucket(data.s3Bucket ?? "");
        setS3AccessKey(data.s3AccessKey ?? "");
        setS3SecretKey(data.s3SecretKey ?? "");
        setS3ForcePathStyle(data.s3ForcePathStyle);
        setGcsBucket(data.gcsBucket ?? "");
        setGcsUseGcpDefaults(data.gcsUseGcpDefaults ?? true);
        setGcsProjectId(data.gcsProjectId ?? "");
        setGcsKeyJson(data.gcsKeyJson ?? "");
        setSlackWebhookUrl(data.slackWebhookUrl ?? "");
      },
      save: async () => {
        const payload: Record<string, unknown> = {
          provider: provider || null,
          retentionDays: retentionDays ? Number(retentionDays) : null,
        };
        if (provider === "s3") {
          payload.s3Endpoint = s3Endpoint || null;
          payload.s3Region = s3Region || null;
          payload.s3Bucket = s3Bucket || null;
          payload.s3AccessKey = s3AccessKey || null;
          if (s3SecretKey && s3SecretKey !== "••••••••") payload.s3SecretKey = s3SecretKey;
          payload.s3ForcePathStyle = s3ForcePathStyle;
        } else if (provider === "gcs") {
          payload.gcsBucket = gcsBucket || null;
          payload.gcsUseGcpDefaults = gcsUseGcpDefaults;
          if (!gcsUseGcpDefaults) {
            payload.gcsProjectId = gcsProjectId || null;
            if (gcsKeyJson && gcsKeyJson !== "••••••••") payload.gcsKeyJson = gcsKeyJson;
          }
        }
        payload.slackWebhookUrl = slackWebhookUrl || null;
        await adminApi.updateBackupSettings(payload);
        void fetchBackupList();
      },
    });

  const { testing, handleTest } = useConnectionTest({
    title: t("admin.settings.backupTestTitle"),
    test: async () => {
      const result = await adminApi.testBackupConnection();
      return {
        ok: result.ok,
        message: result.provider
          ? `${t("admin.settings.backupTestSuccess")} (${result.provider})`
          : t("admin.settings.backupTestSuccess"),
        error: result.error,
      };
    },
    setError,
    setNotice,
    onTestModal,
    testingMessage: t("admin.settings.testing"),
    failMessage: t("admin.settings.backupTestFail"),
  });

  const handleRunBackup = async () => {
    try {
      await adminApi.runBackup();
      setJobStatus((prev) => ({ ...prev, state: "backing-up" }));
    } catch {
      setError(t("admin.settings.backupRunFailed"));
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    try {
      await adminApi.restoreBackup(restoreTarget);
      setRestoreTarget(null);
      setJobStatus((prev) => ({ ...prev, state: "restoring" }));
    } catch {
      setError(t("admin.settings.backupRestoreFailed"));
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await adminApi.deleteBackup(name);
      void fetchBackupList();
    } catch {
      setError(t("admin.settings.backupDeleteFailed"));
    }
  };

  const { backups, latestAt, healthStatus } = backupList;
  const badge = HEALTH_BADGE[healthStatus];
  const isRunning = jobStatus.state !== "idle";

  return (
    <SettingsSectionShell
      title={t("admin.settings.backupTitle")}
      description={t("admin.settings.backupDescription")}
      error={error}
      notice={notice}
      loading={loading}
      onRetry={() => void loadSettings()}
    >
      <div className="space-y-4">
        {/* Job status banner */}
        {isRunning && (
          <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <span>
              {jobStatus.state === "backing-up"
                ? t("admin.settings.backupRunning")
                : t("admin.settings.backupRestoring")}
              {jobStatus.progressMessage && ` — ${jobStatus.progressMessage}`}
            </span>
          </div>
        )}

        {/* Last result banner */}
        {!isRunning && jobStatus.lastResult === "error" && jobStatus.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {t("admin.settings.backupJobError")}: {jobStatus.error}
          </div>
        )}
        {!isRunning && jobStatus.lastResult === "success" && jobStatus.completedAt && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {t("admin.settings.backupJobSuccess")} (
            {new Date(jobStatus.completedAt).toLocaleString()})
          </div>
        )}

        {/* Health status badge */}
        <div
          className={`flex items-center justify-between rounded-lg border p-3 text-sm ${badge.className}`}
        >
          <span className="font-medium">{t(badge.label)}</span>
          {latestAt && (
            <span className="text-xs">
              {t("admin.settings.backupLatest")}: {new Date(latestAt).toLocaleString()}
            </span>
          )}
        </div>

        {/* Backup list */}
        {!listLoading && backups.length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("admin.settings.backupFileName")}</th>
                  <th className="px-3 py-2 font-medium">{t("admin.settings.backupSize")}</th>
                  <th className="px-3 py-2 font-medium">{t("admin.settings.backupDate")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {backups.map((b) => (
                  <tr key={b.name} className="text-gray-700">
                    <td className="px-3 py-2 font-mono text-xs">{b.name}</td>
                    <td className="px-3 py-2">{formatBytes(b.size)}</td>
                    <td className="px-3 py-2">{new Date(b.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setRestoreTarget(b.name)}
                          disabled={isRunning}
                          className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-40"
                        >
                          {t("admin.settings.backupRestore")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(b.name)}
                          disabled={isRunning}
                          className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40"
                        >
                          {t("admin.settings.backupDelete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Run backup button */}
        {provider && (
          <button
            type="button"
            onClick={() => void handleRunBackup()}
            disabled={isRunning || saving}
            className="w-full rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
          >
            {isRunning && jobStatus.state === "backing-up"
              ? t("admin.settings.backupRunning")
              : t("admin.settings.backupRunNow")}
          </button>
        )}

        {/* Settings form */}
        <label className="block text-sm text-gray-700">
          {t("admin.settings.backupProvider")}
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as BackupProviderType | "")}
            className={`${INPUT_CLASS} cursor-pointer`}
          >
            <option value="">{t("admin.settings.backupNone")}</option>
            <option value="s3">{t("admin.settings.storageS3")}</option>
            <option value="gcs">{t("admin.settings.storageGcs")}</option>
          </select>
        </label>

        {provider && (
          <label className="block text-sm text-gray-700">
            {t("admin.settings.backupRetentionDays")}
            <input
              type="number"
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              min={1}
              max={365}
              className={INPUT_CLASS}
            />
          </label>
        )}

        {provider && (
          <label className="block text-sm text-gray-700">
            {t("admin.settings.backupSlackWebhookUrl")}
            <input
              value={slackWebhookUrl}
              onChange={(e) => setSlackWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              className={INPUT_CLASS}
            />
          </label>
        )}

        {provider === "s3" && (
          <S3FieldGroup
            endpoint={s3Endpoint}
            onEndpointChange={setS3Endpoint}
            region={s3Region}
            onRegionChange={setS3Region}
            bucket={s3Bucket}
            onBucketChange={setS3Bucket}
            accessKey={s3AccessKey}
            onAccessKeyChange={setS3AccessKey}
            secretKey={s3SecretKey}
            onSecretKeyChange={setS3SecretKey}
            forcePathStyle={s3ForcePathStyle}
            onForcePathStyleChange={setS3ForcePathStyle}
            bucketPlaceholder="echolore-backups"
          />
        )}

        {provider === "gcs" && (
          <GcsFieldGroup
            bucket={gcsBucket}
            onBucketChange={setGcsBucket}
            useGcpDefaults={gcsUseGcpDefaults}
            onUseGcpDefaultsChange={setGcsUseGcpDefaults}
            projectId={gcsProjectId}
            onProjectIdChange={setGcsProjectId}
            keyJson={gcsKeyJson}
            onKeyJsonChange={setGcsKeyJson}
            bucketPlaceholder="echolore-backups"
          />
        )}

        <div className="flex gap-3">
          <SettingsSaveButton
            saving={saving}
            onClick={() => void handleSave()}
            widthClass="flex-1"
          />
          {provider && (
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={testing || saving}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {testing ? t("admin.settings.testing") : t("admin.settings.testConnection")}
            </button>
          )}
        </div>
      </div>

      {/* Restore confirmation modal */}
      <ModalShell open={restoreTarget !== null} onClose={() => setRestoreTarget(null)}>
        <h3 className="mb-2 text-lg font-semibold text-gray-900">
          {t("admin.settings.backupRestoreConfirmTitle")}
        </h3>
        <p className="mb-4 text-sm text-gray-600">
          {t("admin.settings.backupRestoreConfirmMessage", { name: restoreTarget ?? "" })}
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setRestoreTarget(null)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("admin.settings.backupRestoreCancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleRestore()}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
          >
            {t("admin.settings.backupRestoreConfirmButton")}
          </button>
        </div>
      </ModalShell>
    </SettingsSectionShell>
  );
}
