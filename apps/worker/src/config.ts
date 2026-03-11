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
};

export function getWorkerConfig(): WorkerConfig {
  return {
    mode: (process.env.ROOM_AI_WORKER_MODE as WorkerMode | undefined) ?? "monitor",
    apiBaseUrl: process.env.ROOM_AI_API_BASE_URL || "http://localhost:3001",
    roomAiWorkerSecret: process.env.ROOM_AI_WORKER_SECRET || "",
    livekitHost: process.env.LIVEKIT_HOST || "http://localhost:7880",
    livekitApiKey: process.env.LIVEKIT_API_KEY || "",
    livekitApiSecret: process.env.LIVEKIT_API_SECRET || "",
    pollIntervalMs: Number(process.env.ROOM_AI_POLL_INTERVAL_MS || "15000"),
    webhookPort: Number(process.env.ROOM_AI_WEBHOOK_PORT || "8787"),
  };
}
