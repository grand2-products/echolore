import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { authorizeOwnerResource } from "../../policies/authorization-policy.js";
import { getMeetingById } from "../../repositories/meeting/meeting-repository.js";
import { getRecordingStatus } from "../../services/meeting/recording-service.js";
import { loadFile } from "../../lib/file-storage.js";
import { toIso } from "./dto.js";

export const meetingRecordingRoutes = new Hono<AppEnv>();

// GET /api/meetings/:id/recordings - List recordings for a meeting
meetingRecordingRoutes.get("/:id/recordings", withErrorHandler(async (c) => {
  const { id } = c.req.param();

  const meeting = await getMeetingById(id);
  if (!meeting) return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");

  const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "read");
  if (!authz.allowed) return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");

  const recordings = await getRecordingStatus(id);

  return c.json({
    recordings: recordings.map((r) => ({
      id: r.id,
      status: r.status,
      storagePath: r.storagePath,
      fileSize: r.fileSize,
      durationMs: r.durationMs,
      contentType: r.contentType,
      startedAt: toIso(r.startedAt),
      endedAt: toIso(r.endedAt),
      createdAt: r.createdAt.toISOString(),
    })),
  });
}, "MEETING_RECORDINGS_FETCH_FAILED", "Failed to fetch recordings"));

// GET /api/meetings/:id/recordings/:recordingId/download - Download a recording file
meetingRecordingRoutes.get("/:id/recordings/:recordingId/download", withErrorHandler(async (c) => {
  const { id, recordingId } = c.req.param();

  const meeting = await getMeetingById(id);
  if (!meeting) return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");

  const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "read");
  if (!authz.allowed) return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");

  const recordings = await getRecordingStatus(id);
  const recording = recordings.find((r) => r.id === recordingId);

  if (!recording || recording.status !== "completed" || !recording.storagePath) {
    return jsonError(c, 404, "RECORDING_NOT_FOUND", "Recording not found or not completed");
  }

  if (recording.storagePath.includes("..")) {
    return jsonError(c, 400, "INVALID_PATH", "Invalid recording path");
  }

  const fileBuffer = await loadFile(recording.storagePath);
  const contentType = recording.contentType || "video/mp4";
  const safeId = recordingId.replace(/[^a-z0-9-]/gi, "");
  const filename = `recording-${safeId}.mp4`;

  return new Response(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(fileBuffer.length),
    },
  });
}, "RECORDING_DOWNLOAD_FAILED", "Failed to download recording"));
