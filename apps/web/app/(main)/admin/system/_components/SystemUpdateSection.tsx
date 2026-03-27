"use client";

import type {
  CheckUpdateResponse,
  UpdatePhase,
  UpdateProgressResponse,
  UpdateStepDto,
  UpdateStepStatus,
} from "@echolore/shared/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { ModalShell } from "@/components/wiki";
import { adminApi } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { SettingsSectionShell } from "../../settings/_components/SettingsSectionShell";

const POLL_INTERVAL = 3000;

const STEP_ICON: Record<UpdateStepStatus, string> = {
  pending: "\u25CB", // ○
  running: "\u25D4", // ◔
  done: "\u2713", // ✓
  failed: "\u2717", // ✗
};

const STEP_CLASS: Record<UpdateStepStatus, string> = {
  pending: "text-gray-400",
  running: "text-blue-600 animate-pulse",
  done: "text-emerald-600",
  failed: "text-red-600",
};

export function SystemUpdateSection() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Status
  const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION || "unknown";
  const [updaterAvailable, setUpdaterAvailable] = useState(false);

  // Check update
  const [checking, setChecking] = useState(false);
  const [releaseInfo, setReleaseInfo] = useState<CheckUpdateResponse | null>(null);

  // Progress
  const [progress, setProgress] = useState<UpdateProgressResponse | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  // Confirm modal
  const [confirmUpdate, setConfirmUpdate] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const status = await adminApi.getSystemStatus();
      setUpdaterAvailable(status.updaterAvailable);

      if (status.updateInProgress) {
        // Fetch progress if update in progress
        const prog = await adminApi.getUpdateProgress();
        setProgress(prog);
      }
    } catch {
      setUpdaterAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Poll progress when update is active
  const prevPhaseRef = useRef<UpdatePhase | null>(null);
  useEffect(() => {
    const phase = progress?.phase;
    if (!phase || phase === "idle") {
      if (prevPhaseRef.current === "complete") {
        setNotice(t("admin.system.updateComplete"));
        void fetchStatus();
      }
      prevPhaseRef.current = phase ?? null;
      return;
    }
    if (phase === "complete" || phase === "failed") {
      if (phase === "complete") {
        setNotice(t("admin.system.updateComplete"));
        void fetchStatus();
      }
      prevPhaseRef.current = phase;
      return;
    }
    prevPhaseRef.current = phase;

    const timer = setInterval(() => {
      adminApi
        .getUpdateProgress()
        .then((p) => {
          setProgress(p);
          setReconnecting(false);
        })
        .catch(() => {
          setReconnecting(true);
        });
    }, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [progress?.phase, fetchStatus, t]);

  const handleCheckUpdate = async () => {
    setChecking(true);
    setError(null);
    setReleaseInfo(null);
    try {
      const info = await adminApi.checkUpdate();
      setReleaseInfo(info);
    } catch {
      setError(t("admin.system.checkFailed"));
    } finally {
      setChecking(false);
    }
  };

  const handleStartUpdate = async () => {
    setConfirmUpdate(false);
    setError(null);
    setNotice(null);
    try {
      const result = await adminApi.startUpdate({
        targetVersion: releaseInfo?.latestVersion,
      });
      if (result.success) {
        // Start polling
        const prog = await adminApi.getUpdateProgress();
        setProgress(prog);
      } else {
        setError(result.message);
      }
    } catch {
      setError(t("admin.system.updateFailed"));
    }
  };

  const handleRollback = async () => {
    setError(null);
    setNotice(null);
    try {
      const result = await adminApi.triggerRollback();
      if (result.success) {
        setNotice(result.message);
        setProgress(null);
        void fetchStatus();
      } else {
        setError(result.message);
      }
    } catch {
      setError(t("admin.system.rollbackFailed"));
    }
  };

  const isActive = progress?.phase === "updating-services" || progress?.phase === "self-updating";

  return (
    <SettingsSectionShell
      title={t("admin.system.title")}
      description={t("admin.system.description")}
      error={error}
      notice={notice}
      loading={loading}
      onRetry={() => void fetchStatus()}
    >
      <div className="space-y-4">
        {/* Updater unavailable */}
        {!updaterAvailable && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            {t("admin.system.updaterUnavailable")}
          </div>
        )}

        {/* Reconnecting banner */}
        {reconnecting && (
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
            {t("admin.system.reconnecting")}
          </div>
        )}

        {/* Update progress */}
        {isActive && progress && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              {t("admin.system.updating", {
                from: progress.previousVersion,
                to: progress.targetVersion,
              })}
            </div>
            <StepList steps={progress.steps} />
          </div>
        )}

        {/* Update failed */}
        {progress?.phase === "failed" && (
          <div className="space-y-2">
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {t("admin.system.updateError")}: {progress.error}
            </div>
            <StepList steps={progress.steps} />
            <button
              type="button"
              onClick={() => void handleRollback()}
              className="w-full rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
            >
              {t("admin.system.rollback")}
            </button>
          </div>
        )}

        {/* Update complete */}
        {progress?.phase === "complete" && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {t("admin.system.updateComplete")} ({progress.previousVersion} →{" "}
            {progress.targetVersion})
          </div>
        )}

        {/* Check for updates */}
        {updaterAvailable && !isActive && (
          <>
            <button
              type="button"
              onClick={() => void handleCheckUpdate()}
              disabled={checking}
              className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {checking ? t("admin.system.checking") : t("admin.system.checkForUpdates")}
            </button>

            {/* Release info */}
            {releaseInfo?.updateAvailable && (
              <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-blue-800">
                    {t("admin.system.newVersionAvailable")}
                  </span>
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-mono font-medium text-blue-800">
                    {releaseInfo.latestVersion}
                  </span>
                </div>
                {releaseInfo.publishedAt && (
                  <p className="text-xs text-blue-600">
                    {new Date(releaseInfo.publishedAt).toLocaleDateString()}
                  </p>
                )}
                {releaseInfo.releaseNotes && (
                  <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap text-xs text-blue-700">
                    {releaseInfo.releaseNotes}
                  </pre>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmUpdate(true)}
                  className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                >
                  {t("admin.system.updateNow")}
                </button>
              </div>
            )}

            {releaseInfo && !releaseInfo.updateAvailable && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {t("admin.system.upToDate")}
              </div>
            )}
          </>
        )}
      </div>

      {/* Confirm dialog */}
      <ModalShell open={confirmUpdate} onClose={() => setConfirmUpdate(false)}>
        <h3 className="mb-2 text-lg font-semibold text-gray-900">
          {t("admin.system.confirmTitle")}
        </h3>
        <p className="mb-4 text-sm text-gray-600">
          {t("admin.system.confirmMessage", {
            from: currentVersion,
            to: releaseInfo?.latestVersion ?? "",
          })}
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setConfirmUpdate(false)}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t("common.actions.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleStartUpdate()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            {t("admin.system.updateNow")}
          </button>
        </div>
      </ModalShell>
    </SettingsSectionShell>
  );
}

function StepList({ steps }: { steps: UpdateStepDto[] }) {
  const t = useT();
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <ul className="space-y-1 text-sm">
        {steps.map((step) => (
          <li key={step.name} className={`flex items-center gap-2 ${STEP_CLASS[step.status]}`}>
            <span className="w-4 text-center font-mono">{STEP_ICON[step.status]}</span>
            <span>{t(`admin.system.steps.${step.name}`)}</span>
            {step.message && <span className="text-xs text-gray-500">— {step.message}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
