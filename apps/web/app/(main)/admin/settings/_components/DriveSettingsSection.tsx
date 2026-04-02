"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/lib/api";
import type { DriveSyncStatus } from "@/lib/api/types";
import { useSettingsForm } from "@/lib/hooks/use-settings-form";
import { useT } from "@/lib/i18n";
import {
  INPUT_CLASS,
  SettingsCheckbox,
  SettingsSaveButton,
  SettingsSectionShell,
} from "./SettingsSectionShell";

export function DriveSettingsSection() {
  const t = useT();

  const [driveEnabled, setDriveEnabled] = useState(false);
  const [sharedDriveIds, setSharedDriveIds] = useState("");
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState("60");
  const [includeMimeTypes, setIncludeMimeTypes] = useState("");
  const [excludeFolderIds, setExcludeFolderIds] = useState("");
  const [maxFileSizeMb, setMaxFileSizeMb] = useState("10");

  const [syncStatus, setSyncStatus] = useState<DriveSyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  const { loading, saving, error, notice, loadSettings, handleSave, setError, setNotice } =
    useSettingsForm({
      load: () => adminApi.getDriveSettings(),
      onLoaded: (data) => {
        setDriveEnabled(data.driveEnabled);
        setSharedDriveIds(data.sharedDriveIds ?? "");
        setSyncIntervalMinutes(String(data.syncIntervalMinutes ?? 60));
        setIncludeMimeTypes(data.includeMimeTypes ?? "");
        setExcludeFolderIds(data.excludeFolderIds ?? "");
        setMaxFileSizeMb(String(Math.round((data.maxFileSizeBytes ?? 10485760) / 1024 / 1024)));
      },
      save: async () => {
        await adminApi.updateDriveSettings({
          driveEnabled,
          sharedDriveIds: sharedDriveIds || null,
          syncIntervalMinutes: Number(syncIntervalMinutes) || null,
          includeMimeTypes: includeMimeTypes || null,
          excludeFolderIds: excludeFolderIds || null,
          maxFileSizeBytes: (Number(maxFileSizeMb) || 10) * 1024 * 1024,
        });
        await loadSettings();
      },
    });

  const refreshSyncStatus = useCallback(async () => {
    try {
      const status = await adminApi.getDriveSyncStatus();
      setSyncStatus(status);
    } catch {
      // ignore
    }
  }, []);

  const handleTriggerSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await adminApi.triggerDriveSync();
      setNotice(res.message);
      setTimeout(() => void refreshSyncStatus(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger sync");
    } finally {
      setSyncing(false);
    }
  }, [setError, setNotice, refreshSyncStatus]);

  useEffect(() => {
    void refreshSyncStatus();
  }, [refreshSyncStatus]);

  return (
    <SettingsSectionShell
      title={t("admin.settings.driveTitle")}
      description={t("admin.settings.driveDescription")}
      error={error}
      notice={notice}
      loading={loading}
      onRetry={() => void loadSettings()}
    >
      <div className="space-y-4">
        <SettingsCheckbox
          checked={driveEnabled}
          onChange={setDriveEnabled}
          label={t("admin.settings.driveEnabled")}
          hint={t("admin.settings.driveEnabledHint")}
        />

        <label className="block text-sm text-gray-700">
          {t("admin.settings.driveSharedDriveIds")}
          <input
            value={sharedDriveIds}
            onChange={(e) => setSharedDriveIds(e.target.value)}
            placeholder="0APxxxxxxxx,0APyyyyyyyy"
            className={INPUT_CLASS}
          />
          <span className="mt-1 block text-xs text-gray-400">
            {t("admin.settings.driveSharedDriveIdsHint")}
          </span>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm text-gray-700">
            {t("admin.settings.driveSyncInterval")}
            <input
              type="number"
              value={syncIntervalMinutes}
              onChange={(e) => setSyncIntervalMinutes(e.target.value)}
              min={5}
              max={1440}
              className={INPUT_CLASS}
            />
          </label>

          <label className="block text-sm text-gray-700">
            {t("admin.settings.driveMaxFileSize")}
            <input
              type="number"
              value={maxFileSizeMb}
              onChange={(e) => setMaxFileSizeMb(e.target.value)}
              min={1}
              max={100}
              className={INPUT_CLASS}
            />
          </label>
        </div>

        <label className="block text-sm text-gray-700">
          {t("admin.settings.driveIncludeMimeTypes")}
          <input
            value={includeMimeTypes}
            onChange={(e) => setIncludeMimeTypes(e.target.value)}
            placeholder="Default: Google Docs, Sheets, Slides, PDF"
            className={INPUT_CLASS}
          />
          <span className="mt-1 block text-xs text-gray-400">
            {t("admin.settings.driveIncludeMimeTypesHint")}
          </span>
        </label>

        <label className="block text-sm text-gray-700">
          {t("admin.settings.driveExcludeFolderIds")}
          <input
            value={excludeFolderIds}
            onChange={(e) => setExcludeFolderIds(e.target.value)}
            className={INPUT_CLASS}
          />
        </label>

        <SettingsSaveButton saving={saving} onClick={() => void handleSave()} />

        {/* Sync Status & Trigger */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">
              {t("admin.settings.driveSyncStatus")}
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void refreshSyncStatus()}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                {t("admin.settings.driveSyncRefresh")}
              </button>
              <button
                type="button"
                onClick={() => void handleTriggerSync()}
                disabled={syncing || syncStatus?.syncInProgress}
                className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-60"
              >
                {syncStatus?.syncInProgress
                  ? t("admin.settings.driveSyncing")
                  : t("admin.settings.driveSyncNow")}
              </button>
            </div>
          </div>

          {syncStatus && (
            <div className="mt-3 space-y-1 text-xs text-gray-600">
              <div className="flex gap-4">
                <span>
                  {t("admin.settings.driveSyncTotal")}: {syncStatus.files.total}
                </span>
                <span className="text-green-600">
                  {t("admin.settings.driveSyncIndexed")}: {syncStatus.files.indexed}
                </span>
                <span className="text-yellow-600">
                  {t("admin.settings.driveSyncPending")}: {syncStatus.files.pending}
                </span>
                <span className="text-red-600">
                  {t("admin.settings.driveSyncError")}: {syncStatus.files.error}
                </span>
                <span className="text-gray-400">
                  {t("admin.settings.driveSyncSkipped")}: {syncStatus.files.skipped}
                </span>
              </div>
              {syncStatus.lastSyncAt && (
                <div>
                  {t("admin.settings.driveSyncLastSync", {
                    time: new Date(syncStatus.lastSyncAt).toLocaleString(),
                  })}
                </div>
              )}
              {syncStatus.lastSyncResult && (
                <div>
                  {t("admin.settings.driveSyncLastResult", {
                    indexed: String(syncStatus.lastSyncResult.indexed),
                    skipped: String(syncStatus.lastSyncResult.skipped),
                    errors: String(syncStatus.lastSyncResult.errors),
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </SettingsSectionShell>
  );
}
