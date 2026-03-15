export type WorkerMode = "monitor" | "transcribe-file" | "webhook";

export type WorkerConfig = {
  mode: WorkerMode;
  apiBaseUrl: string;
  roomAiWorkerSecret: string;
  livekitHost: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  pollIntervalMs: number;
  webhookPort: number;
  healthPort: number;
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
    webhookPort: Number(process.env.ROOM_AI_WEBHOOK_PORT || "8787"),
    healthPort: Number(process.env.ROOM_AI_HEALTH_PORT || "8788"),
  };
}
