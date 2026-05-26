export type WorkerMode = "monitor" | "transcribe-file" | "webhook" | "realtime";

export type WorkerConfig = {
  mode: WorkerMode;
  apiBaseUrl: string;
  roomAiWorkerSecret: string;
  livekitHost: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  pollIntervalMs: number;
  reconcileGraceMs: number;
  webhookPort: number;
  healthPort: number;
  apiReadyTimeoutMs: number;
  /** Default STT language for realtime transcription (G3). */
  languageCode: string;
  /**
   * Valkey/Redis URL used to coordinate per-room ownership across HA realtime
   * workers. Empty falls back to in-process locking — fine for single-worker
   * deployments, but two workers without Valkey will double-ingest.
   */
  realtimeRedisUrl: string;
  /** Identifier of this worker process; used as the ownership-lock value. */
  workerId: string;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function getWorkerConfig(): WorkerConfig {
  return {
    mode: (process.env.ROOM_AI_WORKER_MODE as WorkerMode | undefined) ?? "monitor",
    apiBaseUrl: requireEnv("ROOM_AI_API_BASE_URL"),
    roomAiWorkerSecret: process.env.ROOM_AI_WORKER_SECRET || "",
    livekitHost: process.env.LIVEKIT_HOST || "http://localhost:7880",
    livekitApiKey: process.env.LIVEKIT_API_KEY || "",
    livekitApiSecret: process.env.LIVEKIT_API_SECRET || "",
    pollIntervalMs: Number(process.env.ROOM_AI_POLL_INTERVAL_MS || "15000"),
    // Grace before an active meeting with no live LiveKit room is force-ended.
    // Defaults to LiveKit's empty_timeout (300s) so we never end a meeting that
    // LiveKit is still keeping alive during its empty-room countdown.
    reconcileGraceMs: Number(process.env.ROOM_AI_RECONCILE_GRACE_MS || "300000"),
    apiReadyTimeoutMs: Number(process.env.ROOM_AI_API_READY_TIMEOUT_MS || "120000"),
    webhookPort: Number(process.env.ROOM_AI_WEBHOOK_PORT || "8787"),
    healthPort: Number(process.env.ROOM_AI_HEALTH_PORT || "8788"),
    languageCode: process.env.ROOM_AI_LANGUAGE_CODE || "ja-JP",
    realtimeRedisUrl: process.env.REALTIME_REDIS_URL || "",
    // Default to hostname + pid so two pods on the same host still differ.
    workerId: process.env.ROOM_AI_WORKER_ID || `${process.env.HOSTNAME || "worker"}-${process.pid}`,
  };
}
