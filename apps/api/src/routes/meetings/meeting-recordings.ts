import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { loadFile } from "../../lib/file-storage.js";
import { authorizeOwnerResource } from "../../policies/authorization-policy.js";
import { getMeetingById } from "../../services/meeting/meeting-service.js";
import { getRecordingStatus } from "../../services/meeting/recording-service.js";
import { toIso } from "./dto.js";

export const meetingRecordingRoutes = new Hono<AppEnv>();

// GET /api/meetings/:id/recordings - List recordings for a meeting
meetingRecordingRoutes.get(
  "/:id/recordings",
  withErrorHandler("MEETING_RECORDINGS_FETCH_FAILED", "Failed to fetch recordings"),
  async (c) => {
    const { id } = c.req.param();

    const meeting = await getMeetingById(id);
    if (!meeting) return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creator_id, "read");
    if (!authz.allowed) return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");

    const recordings = await getRecordingStatus(id);

    return c.json({
      recordings: recordings.map((r) => ({
        id: r.id,
        status: r.status,
        storagePath: r.storage_path,
        fileSize: r.file_size,
        durationMs: r.duration_ms,
        contentType: r.content_type,
        startedAt: toIso(r.started_at),
        endedAt: toIso(r.ended_at),
        createdAt: r.created_at.toISOString(),
      })),
    });
  }
);

// GET /api/meetings/:id/recordings/:recordingId/download - Download a recording file
meetingRecordingRoutes.get(
  "/:id/recordings/:recordingId/download",
  withErrorHandler("RECORDING_DOWNLOAD_FAILED", "Failed to download recording"),
  async (c) => {
    const { id, recordingId } = c.req.param();

    const meeting = await getMeetingById(id);
    if (!meeting) return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creator_id, "read");
    if (!authz.allowed) return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");

    const recordings = await getRecordingStatus(id);
    const recording = recordings.find((r) => r.id === recordingId);

    if (!recording || recording.status !== "completed" || !recording.storage_path) {
      return jsonError(c, 404, "RECORDING_NOT_FOUND", "Recording not found or not completed");
    }

    if (recording.storage_path.includes("..")) {
      return jsonError(c, 400, "INVALID_PATH", "Invalid recording path");
    }

    const fileBuffer = await loadFile(recording.storage_path);
    const contentType = recording.content_type || "video/mp4";
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
  }
);
