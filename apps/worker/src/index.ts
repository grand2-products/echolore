import { getWorkerConfig } from "./config.js";
import {
  listMeetingsByStatus,
  submitAudioFileForTranscription,
  syncMeetingStatus,
} from "./internal-api-client.js";
import { inspectRooms } from "./livekit-monitor.js";
import { startLiveKitWebhookServer } from "./livekit-webhook-server.js";

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

async function runMonitorMode() {
  const config = getWorkerConfig();
  await waitForApiReady(config.apiBaseUrl);
  console.log(`[room-ai-worker] monitor mode started; polling every ${config.pollIntervalMs}ms`);

  while (true) {
    try {
      const rooms = await inspectRooms({
        host: config.livekitHost,
        apiKey: config.livekitApiKey,
        apiSecret: config.livekitApiSecret,
      });
      // Monitor only needs scheduled meetings — activation of already-active
      // meetings is idempotent but wastes an API call. Ending is handled by
      // the room_finished webhook after LiveKit's emptyTimeout (300s).
      const openMeetings = await listMeetingsByStatus({
        apiBaseUrl: config.apiBaseUrl,
        workerSecret: config.roomAiWorkerSecret,
        status: "scheduled",
      });

      for (const room of rooms) {
        if (room.participantCount === 0) {
          continue;
        }

        const openMeeting = openMeetings.find((meeting) => meeting.roomName === room.roomName);
        if (!openMeeting) {
          continue;
        }

        await syncMeetingStatus({
          apiBaseUrl: config.apiBaseUrl,
          workerSecret: config.roomAiWorkerSecret,
          meetingId: openMeeting.id,
          status: "active",
        });
      }

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

async function main() {
  const config = getWorkerConfig();

  if (config.mode === "transcribe-file") {
    await runTranscribeFileMode();
    return;
  }

  if (config.mode === "webhook") {
    await runWebhookMode();
    return;
  }

  await runMonitorMode();
}

void main().catch((error) => {
  console.error("[room-ai-worker] fatal error", error);
  process.exitCode = 1;
});
