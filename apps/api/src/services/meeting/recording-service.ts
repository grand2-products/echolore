import { EgressClient, EncodedFileOutput, EncodedFileType } from "livekit-server-sdk";
import { livekitApiKey, livekitApiSecret, livekitHost } from "../../lib/livekit-config.js";
import {
  createRecording,
  findActiveRecording as findActiveRecordingRepo,
  getRecordingByEgressId,
  listRecordingsByMeeting,
  updateRecordingByEgressId,
} from "../../repositories/meeting/recording-repository.js";
import { getStorageSettings } from "../admin/admin-service.js";

const egressClient = new EgressClient(livekitHost, livekitApiKey, livekitApiSecret);

export async function startRecording(roomName: string, meetingId: string, userId: string) {
  // Build output config based on storage settings
  const storageRaw = await getStorageSettings();
  // Convert null values to undefined for the builder
  const storage = Object.fromEntries(
    Object.entries(storageRaw).map(([k, v]) => [k, v ?? undefined])
  ) as Record<string, string | undefined> & { provider: string };
  const fileOutput = buildFileOutput(roomName, storage);

  const info = await egressClient.startTrackCompositeEgress(roomName, fileOutput);

  const id = crypto.randomUUID();
  const recording = await createRecording({
    id,
    meetingId,
    egressId: info.egressId,
    status: "starting",
    initiatedBy: userId,
    contentType: "video/mp4",
  });

  return { egressInfo: info, recording };
}

export async function stopRecording(egressId: string) {
  await egressClient.stopEgress(egressId);
  await updateRecordingByEgressId(egressId, { status: "stopping" });
}

export async function getRecordingStatus(meetingId: string) {
  return listRecordingsByMeeting(meetingId);
}

export async function getActiveRecording(meetingId: string) {
  return findActiveRecordingRepo(meetingId);
}

export async function handleEgressWebhook(event: {
  egressInfo?: {
    egressId: string;
    status: number;
    fileResults?: Array<{
      filename?: string;
      size?: bigint | number;
      duration?: bigint | number;
    }>;
    error?: string;
  };
}) {
  const info = event.egressInfo;
  if (!info) return;

  const { egressId, status: egressStatus } = info;

  // Map EgressStatus enum values
  // 0=EGRESS_STARTING, 1=EGRESS_ACTIVE, 2=EGRESS_ENDING, 3=EGRESS_COMPLETE, 4=EGRESS_FAILED
  let status: string;
  switch (egressStatus) {
    case 0:
      status = "starting";
      break;
    case 1:
      status = "recording";
      break;
    case 2:
      status = "stopping";
      break;
    case 3:
      status = "completed";
      break;
    case 4:
      status = "failed";
      break;
    default:
      console.warn(`[recording] Unknown egress status: ${egressStatus} for egress ${egressId}`);
      return;
  }

  const updates: Record<string, unknown> = { status };

  if (status === "recording") {
    updates.startedAt = new Date();
  }

  if (status === "completed") {
    updates.endedAt = new Date();
    const fileResult = info.fileResults?.[0];
    if (fileResult) {
      updates.storagePath = fileResult.filename ?? null;
      updates.fileSize = fileResult.size ? Number(fileResult.size) : null;
      updates.durationMs = fileResult.duration
        ? Math.round(Number(fileResult.duration) / 1_000_000) // ns -> ms
        : null;
    }
  }

  if (status === "failed") {
    updates.endedAt = new Date();
    updates.errorMessage = info.error ?? "Unknown error";
  }

  await updateRecordingByEgressId(egressId, updates);

  // Trigger transcription and notification on completion (fire-and-forget)
  if (status === "completed") {
    const recording = await getRecordingByEgressId(egressId);
    if (recording?.storagePath) {
      const path = recording.storagePath;
      import("./recording-transcription-service.js")
        .then(({ transcribeRecording }) => transcribeRecording(recording.meetingId, path))
        .catch((err) => console.error("[recording] Auto-transcription failed:", err));
    }
    // Email notification
    if (recording) {
      import("../notification/notification-service.js")
        .then(({ notifyRecordingComplete }) =>
          notifyRecordingComplete(recording.meetingId, "Untitled Meeting", recording.initiatedBy)
        )
        .catch((err) => console.error("[recording] Notification failed:", err));
    }
  }
}

function buildFileOutput(
  roomName: string,
  storage: {
    provider: string;
    gcsBucket?: string;
    gcsKeyJson?: string;
    s3Bucket?: string;
    s3AccessKey?: string;
    s3SecretKey?: string;
    s3Endpoint?: string;
    s3Region?: string;
    localPath?: string;
  }
): EncodedFileOutput {
  const filepath = `recordings/${roomName}/{time}`;

  if (storage.provider === "gcs" && storage.gcsBucket) {
    return new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath,
      output: {
        case: "gcp",
        value: {
          bucket: storage.gcsBucket,
          credentials: storage.gcsKeyJson ?? "",
        },
      },
    });
  }

  if (storage.provider === "s3" && storage.s3Bucket) {
    return new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath,
      output: {
        case: "s3",
        value: {
          bucket: storage.s3Bucket,
          accessKey: storage.s3AccessKey ?? "",
          secret: storage.s3SecretKey ?? "",
          endpoint: storage.s3Endpoint ?? "",
          region: storage.s3Region ?? "",
        },
      },
    });
  }

  // Local / default: write to local file path
  const basePath = storage.localPath ?? "/data/files";
  return new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: `${basePath}/${filepath}`,
  });
}
