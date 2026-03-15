import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { authorizeOwnerResource } from "../../policies/authorization-policy.js";
import { createTranscript, getMeetingById } from "../../repositories/meeting/meeting-repository.js";
import {
  listRealtimeTranscriptSegments,
  upsertTranscriptSegment,
} from "../../services/meeting/meeting-realtime-service.js";
import { toTranscriptDto } from "./dto.js";
import { createTranscriptSchema, realtimeTranscriptSchema } from "./schemas.js";

export const meetingTranscriptRoutes = new Hono<AppEnv>();

// POST /api/meetings/:id/transcripts - Add transcript
meetingTranscriptRoutes.post(
  "/:id/transcripts",
  zValidator("json", createTranscriptSchema),
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();
      const data = c.req.valid("json");

      const meeting = await getMeetingById(id);
      if (!meeting) {
        return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
      }

      const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "write");
      if (!authz.allowed) {
        return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");
      }

      const transcriptId = crypto.randomUUID();

      const newTranscript = await createTranscript({
        id: transcriptId,
        meetingId: id,
        speakerId: data.speakerId || null,
        content: data.content,
        timestamp: new Date(data.timestamp),
        createdAt: new Date(),
      });

      if (!newTranscript) {
        return jsonError(c, 500, "MEETING_TRANSCRIPT_CREATE_FAILED", "Failed to add transcript");
      }

      return c.json({ transcript: toTranscriptDto(newTranscript) }, 201);
    },
    "MEETING_TRANSCRIPT_CREATE_FAILED",
    "Failed to add transcript"
  )
);

// GET /api/meetings/:id/realtime/transcripts
meetingTranscriptRoutes.get(
  "/:id/realtime/transcripts",
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();

      const meeting = await getMeetingById(id);
      if (!meeting) return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");

      const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "read");
      if (!authz.allowed) return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");

      return c.json({ segments: await listRealtimeTranscriptSegments(id) });
    },
    "MEETING_REALTIME_TRANSCRIPTS_FETCH_FAILED",
    "Failed to fetch realtime transcripts"
  )
);

// POST /api/meetings/:id/realtime/transcripts
meetingTranscriptRoutes.post(
  "/:id/realtime/transcripts",
  zValidator("json", realtimeTranscriptSchema),
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();
      const data = c.req.valid("json");

      const meeting = await getMeetingById(id);
      if (!meeting) return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");

      const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "write");
      if (!authz.allowed) return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");

      const segment = await upsertTranscriptSegment({
        meetingId: id,
        participantIdentity: data.participantIdentity,
        speakerUserId: data.speakerUserId ?? null,
        speakerLabel: data.speakerLabel,
        content: data.content,
        isPartial: data.isPartial,
        segmentKey: data.segmentKey,
        provider: data.provider,
        confidence: data.confidence ?? null,
        startedAt: new Date(data.startedAt),
        finalizedAt: data.finalizedAt ? new Date(data.finalizedAt) : null,
      });

      return c.json({ segment }, 201);
    },
    "MEETING_REALTIME_TRANSCRIPT_UPSERT_FAILED",
    "Failed to upsert realtime transcript"
  )
);
