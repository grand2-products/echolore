export type BackupJobState = "idle" | "backing-up" | "restoring";

export interface BackupJobStatus {
  state: BackupJobState;
  operation: "backup" | "restore" | null;
  startedAt: string | null;
  targetFile: string | null;
  progressMessage: string | null;
  error: string | null;
  completedAt: string | null;
  lastResult: "success" | "error" | null;
}

const INITIAL_STATUS: BackupJobStatus = {
  state: "idle",
  operation: null,
  startedAt: null,
  targetFile: null,
  progressMessage: null,
  error: null,
  completedAt: null,
  lastResult: null,
};

let current: BackupJobStatus = { ...INITIAL_STATUS };

export function getJobStatus(): BackupJobStatus {
  return { ...current };
}

export function isOperationRunning(): boolean {
  return current.state !== "idle";
}

export function acquireJob(operation: "backup" | "restore", targetFile: string): boolean {
  if (current.state !== "idle") return false;
  current = {
    state: operation === "backup" ? "backing-up" : "restoring",
    operation,
    startedAt: new Date().toISOString(),
    targetFile,
    progressMessage: null,
    error: null,
    completedAt: null,
    lastResult: null,
  };
  return true;
}

export function updateProgress(message: string): void {
  current.progressMessage = message;
}

export function updateTargetFile(targetFile: string): void {
  current.targetFile = targetFile;
}

export function completeJob(result: "success" | "error", error?: string): void {
  current = {
    ...current,
    state: "idle",
    completedAt: new Date().toISOString(),
    lastResult: result,
    error: error ?? null,
    progressMessage: null,
  };
}
