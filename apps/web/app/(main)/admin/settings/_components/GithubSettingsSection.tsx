"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/lib/api";
import type { GithubRepo, GithubRepoStatus } from "@/lib/api/types";
import { useSettingsForm } from "@/lib/hooks/use-settings-form";
import { useT } from "@/lib/i18n";
import {
  INPUT_CLASS,
  SettingsCheckbox,
  SettingsSaveButton,
  SettingsSectionShell,
} from "./SettingsSectionShell";

interface SyncLog {
  id: string;
  trigger: string;
  status: string;
  filesProcessed: number;
  filesAdded: number;
  filesUpdated: number;
  filesRemoved: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export function GithubSettingsSection() {
  const t = useT();

  const [githubEnabled, setGithubEnabled] = useState(false);
  const [githubAppId, setGithubAppId] = useState("");
  const [githubAppPrivateKey, setGithubAppPrivateKey] = useState("");
  const [githubWebhookSecret, setGithubWebhookSecret] = useState("");
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState("60");
  const [maxFileSizeMb, setMaxFileSizeMb] = useState("10");

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message?: string;
    error?: string;
  } | null>(null);

  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [repoStatuses, setRepoStatuses] = useState<Map<string, GithubRepoStatus>>(new Map());
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [newOwner, setNewOwner] = useState("");
  const [newName, setNewName] = useState("");
  const [newPathPrefix, setNewPathPrefix] = useState("");
  const [newInstallationId, setNewInstallationId] = useState("");
  const [newBranch, setNewBranch] = useState("main");
  const [newAccessScope, setNewAccessScope] = useState("all_members");
  const [newFileExtensions, setNewFileExtensions] = useState("md,mdx");
  const [newGroupIds, setNewGroupIds] = useState("");
  const [expandedRepoId, setExpandedRepoId] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [installRepos, setInstallRepos] = useState<
    Array<{ full_name: string; default_branch: string }>
  >([]);
  const [loadingInstallRepos, setLoadingInstallRepos] = useState(false);

  const { loading, saving, error, notice, loadSettings, handleSave, setError, setNotice } =
    useSettingsForm({
      load: () => adminApi.getGithubSettings(),
      onLoaded: (data) => {
        setGithubEnabled(data.githubEnabled);
        setGithubAppId(data.githubAppId ?? "");
        setGithubAppPrivateKey(data.githubAppPrivateKey ?? "");
        setGithubWebhookSecret(data.githubWebhookSecret ?? "");
        setSyncIntervalMinutes(String(data.syncIntervalMinutes ?? 60));
        setMaxFileSizeMb(String(Math.round((data.maxFileSizeBytes ?? 10485760) / 1024 / 1024)));
      },
      save: async () => {
        await adminApi.updateGithubSettings({
          githubEnabled,
          githubAppId: githubAppId || null,
          githubAppPrivateKey: githubAppPrivateKey || null,
          githubWebhookSecret: githubWebhookSecret || null,
          syncIntervalMinutes: Number(syncIntervalMinutes) || null,
          maxFileSizeBytes: (Number(maxFileSizeMb) || 10) * 1024 * 1024,
        });
        await loadSettings();
      },
    });

  const loadRepos = useCallback(async () => {
    try {
      const list = await adminApi.listGithubRepos();
      setRepos(list);
      const statusMap = new Map<string, GithubRepoStatus>();
      for (const repo of list) {
        const repoWithStats = repo as GithubRepo & { stats?: GithubRepoStatus["stats"] };
        if (repoWithStats.stats) {
          statusMap.set(repo.id, { repo, stats: repoWithStats.stats });
        }
      }
      setRepoStatuses(statusMap);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadRepos();
  }, [loadRepos]);

  const handleTestConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await adminApi.testGithubConnection();
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setTesting(false);
    }
  }, []);

  const handleFetchInstallRepos = useCallback(async () => {
    const instId = Number(newInstallationId);
    if (!instId) return;
    setLoadingInstallRepos(true);
    try {
      const result = await adminApi.listInstallationRepos(instId);
      setInstallRepos(result);
    } catch {
      setInstallRepos([]);
    } finally {
      setLoadingInstallRepos(false);
    }
  }, [newInstallationId]);

  const handleSelectInstallRepo = useCallback((fullName: string, defaultBranch: string) => {
    const slashIdx = fullName.indexOf("/");
    if (slashIdx >= 0) {
      setNewOwner(fullName.slice(0, slashIdx));
      setNewName(fullName.slice(slashIdx + 1));
    }
    setNewBranch(defaultBranch);
  }, []);

  const handleAddRepo = useCallback(async () => {
    try {
      const extensions = newFileExtensions
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const groupIds =
        newAccessScope === "groups"
          ? newGroupIds
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;
      await adminApi.createGithubRepo({
        owner: newOwner,
        name: newName,
        pathPrefix: newPathPrefix || undefined,
        installationId: Number(newInstallationId),
        branch: newBranch || undefined,
        accessScope: newAccessScope || undefined,
        fileExtensions: extensions.length > 0 ? extensions : undefined,
        groupIds,
      });
      setShowAddRepo(false);
      setNewOwner("");
      setNewName("");
      setNewPathPrefix("");
      setNewInstallationId("");
      setNewBranch("main");
      setNewAccessScope("all_members");
      setNewFileExtensions("md,mdx");
      setNewGroupIds("");
      await loadRepos();
      setNotice("Repository added");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add repository");
    }
  }, [
    newOwner,
    newName,
    newPathPrefix,
    newInstallationId,
    newBranch,
    newAccessScope,
    newFileExtensions,
    newGroupIds,
    loadRepos,
    setNotice,
    setError,
  ]);

  const handleDeleteRepo = useCallback(
    async (id: string) => {
      if (!window.confirm(t("admin.settings.githubDeleteRepoConfirm"))) return;
      try {
        await adminApi.deleteGithubRepo(id);
        await loadRepos();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete repository");
      }
    },
    [loadRepos, setError, t]
  );

  const handleSyncRepo = useCallback(
    async (id: string) => {
      try {
        await adminApi.syncGithubRepo(id);
        setNotice("Sync triggered");
        setTimeout(() => void loadRepos(), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to trigger sync");
      }
    },
    [loadRepos, setNotice, setError]
  );

  const handleReindexAll = useCallback(async () => {
    try {
      await adminApi.reindexAllGithubRepos();
      setNotice("Reindex triggered");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger reindex");
    }
  }, [setNotice, setError]);

  const handleLoadSyncLogs = useCallback(
    async (repoId: string) => {
      if (expandedRepoId === repoId) {
        setExpandedRepoId(null);
        return;
      }
      setExpandedRepoId(repoId);
      setLoadingLogs(true);
      try {
        const logs = await adminApi.getGithubSyncLogs(repoId);
        setSyncLogs(logs as SyncLog[]);
      } catch {
        setSyncLogs([]);
      } finally {
        setLoadingLogs(false);
      }
    },
    [expandedRepoId]
  );

  return (
    <SettingsSectionShell
      title={t("admin.settings.githubTitle")}
      description={t("admin.settings.githubDescription")}
      error={error}
      notice={notice}
      loading={loading}
      onRetry={() => void loadSettings()}
    >
      <div className="space-y-4">
        <SettingsCheckbox
          checked={githubEnabled}
          onChange={setGithubEnabled}
          label={t("admin.settings.githubEnabled")}
          hint={t("admin.settings.githubEnabledHint")}
        />

        <label className="block text-sm text-gray-700">
          {t("admin.settings.githubAppId")}
          <input
            value={githubAppId}
            onChange={(e) => setGithubAppId(e.target.value)}
            placeholder="123456"
            className={INPUT_CLASS}
          />
        </label>

        <label className="block text-sm text-gray-700">
          {t("admin.settings.githubAppPrivateKey")}
          <textarea
            value={githubAppPrivateKey}
            onChange={(e) => setGithubAppPrivateKey(e.target.value)}
            placeholder="-----BEGIN RSA PRIVATE KEY-----..."
            rows={3}
            className={INPUT_CLASS}
          />
        </label>

        <label className="block text-sm text-gray-700">
          {t("admin.settings.githubWebhookSecret")}
          <input
            value={githubWebhookSecret}
            onChange={(e) => setGithubWebhookSecret(e.target.value)}
            className={INPUT_CLASS}
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm text-gray-700">
            {t("admin.settings.githubSyncInterval")}
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
            {t("admin.settings.githubMaxFileSize")}
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

        <div className="flex gap-2">
          <SettingsSaveButton
            saving={saving}
            onClick={() => void handleSave()}
            widthClass="flex-1"
          />
          <button
            type="button"
            onClick={() => void handleTestConnection()}
            disabled={testing}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {testing ? "..." : t("admin.settings.githubTestConnection")}
          </button>
        </div>

        {testResult && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              testResult.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {testResult.ok ? testResult.message : testResult.error}
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">{t("admin.settings.githubRepos")}</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleReindexAll()}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                {t("admin.settings.githubReindexAll")}
              </button>
              <button
                type="button"
                onClick={() => setShowAddRepo(!showAddRepo)}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                {t("admin.settings.githubAddRepo")}
              </button>
            </div>
          </div>

          {showAddRepo && (
            <div className="mt-3 space-y-2 rounded-lg border border-gray-200 bg-white p-3">
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={newInstallationId}
                  onChange={(e) => setNewInstallationId(e.target.value)}
                  placeholder="Installation ID"
                  type="number"
                  className={INPUT_CLASS}
                />
                <button
                  type="button"
                  onClick={() => void handleFetchInstallRepos()}
                  disabled={!newInstallationId || loadingInstallRepos}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                >
                  {loadingInstallRepos
                    ? t("admin.settings.githubLoading")
                    : t("admin.settings.githubFetchRepos")}
                </button>
              </div>
              {installRepos.length > 0 && (
                <select
                  onChange={(e) => {
                    const selected = installRepos.find((r) => r.full_name === e.target.value);
                    if (selected)
                      handleSelectInstallRepo(selected.full_name, selected.default_branch);
                  }}
                  className={INPUT_CLASS}
                  value={`${newOwner}/${newName}`}
                >
                  <option value="">{t("admin.settings.githubSelectRepo")}</option>
                  {installRepos.map((r) => (
                    <option key={r.full_name} value={r.full_name}>
                      {r.full_name}
                    </option>
                  ))}
                </select>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={newOwner}
                  onChange={(e) => setNewOwner(e.target.value)}
                  placeholder="Owner (e.g. my-org)"
                  className={INPUT_CLASS}
                />
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Repo name"
                  className={INPUT_CLASS}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={newPathPrefix}
                  onChange={(e) => setNewPathPrefix(e.target.value)}
                  placeholder="Path prefix (e.g. docs/)"
                  className={INPUT_CLASS}
                />
                <input
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  placeholder="Branch (default: main)"
                  className={INPUT_CLASS}
                />
                <input
                  value={newFileExtensions}
                  onChange={(e) => setNewFileExtensions(e.target.value)}
                  placeholder="Extensions (md,mdx,ts)"
                  className={INPUT_CLASS}
                />
              </div>
              <select
                value={newAccessScope}
                onChange={(e) => setNewAccessScope(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="all_members">All Members</option>
                <option value="admins">Admins Only</option>
                <option value="groups">Specific Groups</option>
              </select>
              {newAccessScope === "groups" && (
                <input
                  value={newGroupIds}
                  onChange={(e) => setNewGroupIds(e.target.value)}
                  placeholder="Group IDs (comma-separated)"
                  className={INPUT_CLASS}
                />
              )}
              <button
                type="button"
                onClick={() => void handleAddRepo()}
                className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-500"
              >
                {t("admin.settings.githubAddRepoConfirm")}
              </button>
            </div>
          )}

          {repos.length === 0 ? (
            <p className="mt-3 text-xs text-gray-500">{t("admin.settings.githubNoRepos")}</p>
          ) : (
            <div className="mt-3 space-y-2">
              {repos.map((repo) => {
                const status = repoStatuses.get(repo.id);
                return (
                  <div key={repo.id}>
                    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          {repo.owner}/{repo.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {repo.pathPrefix || "/"} @ {repo.branch} &middot; {repo.accessScope}
                          {(repo.fileExtensions?.length ?? 0) > 0 && (
                            <> &middot; {repo.fileExtensions?.join(",")}</>
                          )}
                          &middot; {repo.fileCount} files &middot;{" "}
                          <span
                            className={
                              repo.syncStatus === "idle"
                                ? "text-green-600"
                                : repo.syncStatus === "syncing"
                                  ? "text-yellow-600"
                                  : "text-red-600"
                            }
                          >
                            {repo.syncStatus}
                          </span>
                          {repo.syncError ? ` (${repo.syncError})` : ""}
                        </div>
                        {status && (
                          <div className="mt-1 flex gap-3 text-xs text-gray-500">
                            <span>Total: {status.stats.total}</span>
                            <span className="text-green-600">Indexed: {status.stats.indexed}</span>
                            <span className="text-yellow-600">Pending: {status.stats.pending}</span>
                            <span className="text-red-600">Error: {status.stats.error}</span>
                            <span className="text-gray-400">Skipped: {status.stats.skipped}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => void handleLoadSyncLogs(repo.id)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          {t("admin.settings.githubLogs")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSyncRepo(repo.id)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          {t("admin.settings.githubSync")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteRepo(repo.id)}
                          className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          {t("admin.settings.githubDeleteRepo")}
                        </button>
                      </div>
                    </div>
                    {expandedRepoId === repo.id && (
                      <div className="rounded-b-lg border border-t-0 border-gray-200 bg-gray-50 p-3">
                        <div className="mb-2 text-xs font-medium text-gray-600">
                          {t("admin.settings.githubSyncHistory")}
                        </div>
                        {loadingLogs ? (
                          <div className="text-xs text-gray-400">
                            {t("admin.settings.githubLoading")}
                          </div>
                        ) : syncLogs.length === 0 ? (
                          <div className="text-xs text-gray-400">
                            {t("admin.settings.githubNoSyncLogs")}
                          </div>
                        ) : (
                          <div className="max-h-48 space-y-1 overflow-y-auto">
                            {syncLogs.map((log) => (
                              <div
                                key={log.id}
                                className="flex items-center gap-3 rounded border border-gray-200 bg-white px-2 py-1 text-xs"
                              >
                                <span
                                  className={
                                    log.status === "success"
                                      ? "text-green-600"
                                      : log.status === "running"
                                        ? "text-yellow-600"
                                        : "text-red-600"
                                  }
                                >
                                  {log.status}
                                </span>
                                <span className="text-gray-500">{log.trigger}</span>
                                <span className="text-gray-400">
                                  +{log.filesAdded} ~{log.filesUpdated} -{log.filesRemoved}
                                </span>
                                <span className="text-gray-400">
                                  {new Date(log.startedAt).toLocaleString()}
                                </span>
                                {log.errorMessage && (
                                  <span className="truncate text-red-500">{log.errorMessage}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </SettingsSectionShell>
  );
}
