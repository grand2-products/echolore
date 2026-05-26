import { getWorkerConfig } from "./config.js";
import { setHealthy, startHealthServer } from "./health.js";
import {
  listMeetingsByStatus,
  resolveMeetingByRoomName,
  submitAudioFileForTranscription,
  syncMeetingStatus,
} from "./internal-api-client.js";
import { inspectRooms } from "./livekit-monitor.js";
import { startLiveKitWebhookServer } from "./livekit-webhook-server.js";
import { createGoogleStreamingTranscriber } from "./realtime/google-stt-transcriber.js";
import { RealtimeTranscriptionManager } from "./realtime/manager.js";
import { createRtcNodeAudioSource } from "./realtime/rtc-node-audio-source.js";
import { selectStaleActiveMeetings } from "./reconcile.js";

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

async function waitForApiReady(apiBaseUrl: string, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${apiBaseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // API may still be starting; retry until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`API did not become ready within ${timeoutMs}ms: ${apiBaseUrl}/health`);
}

const shutdownController = new AbortController();

async function runMonitorMode() {
  const config = getWorkerConfig();
  await waitForApiReady(config.apiBaseUrl, config.apiReadyTimeoutMs);
  console.log(`[room-ai-worker] monitor mode started; polling every ${config.pollIntervalMs}ms`);

  while (!shutdownController.signal.aborted) {
    try {
      const rooms = await inspectRooms({
        host: config.livekitHost,
        apiKey: config.livekitApiKey,
        apiSecret: config.livekitApiSecret,
      });
      // Fetch scheduled (to activate) and active (to reconcile/end) meetings.
      const [scheduledMeetings, activeMeetings] = await Promise.all([
        listMeetingsByStatus({
          apiBaseUrl: config.apiBaseUrl,
          workerSecret: config.roomAiWorkerSecret,
          status: "scheduled",
        }),
        listMeetingsByStatus({
          apiBaseUrl: config.apiBaseUrl,
          workerSecret: config.roomAiWorkerSecret,
          status: "active",
        }),
      ]);

      // Promote scheduled meetings whose room has participants to active.
      for (const room of rooms) {
        if (room.participantCount === 0) {
          continue;
        }

        const scheduledMeeting = scheduledMeetings.find(
          (meeting) => meeting.roomName === room.roomName
        );
        if (!scheduledMeeting) {
          continue;
        }

        await syncMeetingStatus({
          apiBaseUrl: config.apiBaseUrl,
          workerSecret: config.roomAiWorkerSecret,
          meetingId: scheduledMeeting.id,
          status: "active",
        });
      }

      // End "stale active" meetings: active in the DB but no live LiveKit room.
      // This is the production end mechanism — LiveKit's room_finished event is
      // not delivered to a handler that ends meetings, so without this an active
      // meeting would stay active forever once everyone leaves.
      const now = new Date();
      const staleMeetings = selectStaleActiveMeetings({
        activeMeetings,
        liveRoomNames: rooms.map((room) => room.roomName),
        now,
        graceMs: config.reconcileGraceMs,
      });

      for (const meeting of staleMeetings) {
        await syncMeetingStatus({
          apiBaseUrl: config.apiBaseUrl,
          workerSecret: config.roomAiWorkerSecret,
          meetingId: meeting.id,
          status: "ended",
          endedAt: now.toISOString(),
        });
        console.log(
          `[room-ai-worker] reconciled stale active meeting=${meeting.id} room=${meeting.roomName} -> ended`
        );
      }

      setHealthy(true);
      console.log(
        `[room-ai-worker] rooms=${rooms.length} ${rooms
          .map((room) => `${room.roomName}:${room.participantCount}`)
          .join(", ")}`
      );
    } catch (error) {
      console.error("[room-ai-worker] monitor iteration failed", error);
    }

    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }
}

async function runTranscribeFileMode() {
  const config = getWorkerConfig();
  const meetingId = getArgValue("--meetingId");
  const filePath = getArgValue("--file");
  const participantIdentity = getArgValue("--participantIdentity") ?? "worker-participant";
  const speakerLabel = getArgValue("--speakerLabel") ?? participantIdentity;
  const mimeType = getArgValue("--mimeType") ?? "audio/webm";
  const languageCode = getArgValue("--languageCode") ?? "ja-JP";

  if (!meetingId || !filePath) {
    throw new Error("transcribe-file mode requires --meetingId and --file");
  }

  const result = await submitAudioFileForTranscription({
    apiBaseUrl: config.apiBaseUrl,
    workerSecret: config.roomAiWorkerSecret,
    meetingId,
    participantIdentity,
    speakerLabel,
    segmentKey: `${participantIdentity}-${Date.now()}`,
    filePath,
    mimeType,
    languageCode,
  });

  console.log(JSON.stringify(result, null, 2));
}

async function runWebhookMode() {
  const config = getWorkerConfig();
  await startLiveKitWebhookServer({
    port: config.webhookPort,
    livekitApiKey: config.livekitApiKey,
    livekitApiSecret: config.livekitApiSecret,
    apiBaseUrl: config.apiBaseUrl,
    roomAiWorkerSecret: config.roomAiWorkerSecret,
  });
}

// Holds the active realtime manager so graceful shutdown can stop sessions.
let realtimeManager: RealtimeTranscriptionManager | null = null;

// Realtime mode (G3): runs the webhook server and, on room_started/room_finished,
// starts/stops a per-room transcription session that subscribes to participant
// audio and ingests transcript segments. The media (@livekit/rtc-node) and STT
// (Google streaming) bindings are runtime-verification boundaries; see
// src/realtime/*-source.ts / *-transcriber.ts.
async function runRealtimeMode() {
  const config = getWorkerConfig();
  await waitForApiReady(config.apiBaseUrl, config.apiReadyTimeoutMs);

  const manager = new RealtimeTranscriptionManager({
    apiBaseUrl: config.apiBaseUrl,
    workerSecret: config.roomAiWorkerSecret,
    languageCode: config.languageCode,
    resolveMeetingId: async (roomName) => {
      try {
        const meeting = await resolveMeetingByRoomName({
          apiBaseUrl: config.apiBaseUrl,
          workerSecret: config.roomAiWorkerSecret,
          roomName,
        });
        return meeting.id;
      } catch {
        return null;
      }
    },
    createSource: ({ roomName, meetingId }) =>
      createRtcNodeAudioSource({
        roomName,
        meetingId,
        livekitHost: config.livekitHost,
        livekitApiKey: config.livekitApiKey,
        livekitApiSecret: config.livekitApiSecret,
      }),
    createTranscriber: createGoogleStreamingTranscriber,
  });
  realtimeManager = manager;

  await startLiveKitWebhookServer({
    port: config.webhookPort,
    livekitApiKey: config.livekitApiKey,
    livekitApiSecret: config.livekitApiSecret,
    apiBaseUrl: config.apiBaseUrl,
    roomAiWorkerSecret: config.roomAiWorkerSecret,
    onRoomStarted: (roomName) => {
      void manager.startForRoom(roomName).catch((err) => {
        console.error(`[room-ai-worker] realtime startForRoom failed room=${roomName}`, err);
      });
    },
    onRoomFinished: (roomName) => {
      void manager.stopForRoom(roomName).catch((err) => {
        console.error(`[room-ai-worker] realtime stopForRoom failed room=${roomName}`, err);
      });
    },
  });
}

async function main() {
  const config = getWorkerConfig();

  if (!config.roomAiWorkerSecret && process.env.NODE_ENV === "production") {
    throw new Error("ROOM_AI_WORKER_SECRET is required in production");
  }

  if (config.mode === "transcribe-file") {
    await runTranscribeFileMode();
    return;
  }

  // Start health server for long-running modes
  startHealthServer(config.healthPort);

  if (config.mode === "webhook") {
    await runWebhookMode();
    return;
  }

  if (config.mode === "realtime") {
    await runRealtimeMode();
    return;
  }

  await runMonitorMode();
}

// Graceful shutdown
function gracefulShutdown(signal: string) {
  console.log(`[room-ai-worker] ${signal} received, shutting down`);
  setHealthy(false);
  shutdownController.abort();
  void realtimeManager?.stopAll().catch(() => {});
  // Allow in-flight operations to finish
  setTimeout(() => process.exit(0), 5000);
}
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

void main().catch((error) => {
  console.error("[room-ai-worker] fatal error", error);
  process.exitCode = 1;
});
