import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { jsonError, withErrorHandler } from "../lib/api-error.js";
import { requireRoomAiWorker } from "../lib/internal-auth.js";
import { getUserById } from "../repositories/user/user-repository.js";
import {
  transcribeMeetingAudioSegment,
  upsertTranscriptSegment,
} from "../services/meeting/meeting-realtime-service.js";
import {
  closeAllParticipantSessions,
  getMeetingById,
  getMeetingByRoomName,
  listMeetingsByStatus,
  recordParticipantJoin,
  recordParticipantLeave,
  updateMeeting,
} from "../services/meeting/meeting-service.js";

export const internalRoomAiRoutes = new Hono();

const transcribeAudioSchema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1),
  languageCode: z.string().min(2),
  provider: z.enum(["google", "vertex", "zhipu", "openai-compatible"]).optional(),
  participantIdentity: z.string().min(1),
  speakerUserId: z.string().nullable().optional(),
  speakerLabel: z.string().optional(),
  segmentKey: z.string().min(1),
  startedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid ISO timestamp",
  }),
  finalizedAt: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Invalid ISO timestamp",
    })
    .nullable()
    .optional(),
});

const transcriptSegmentSchema = z.object({
  participantIdentity: z.string().min(1),
  speakerUserId: z.string().nullable().optional(),
  speakerLabel: z.string().min(1),
  content: z.string().min(1),
  isPartial: z.boolean().default(false),
  segmentKey: z.string().min(1),
  provider: z.string().min(1),
  confidence: z.number().min(0).max(1).nullable().optional(),
  startedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid ISO timestamp",
  }),
  finalizedAt: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Invalid ISO timestamp",
    })
    .nullable()
    .optional(),
});

const participantJoinSchema = z.object({
  participantIdentity: z.string().min(1),
  displayName: z.string().min(1),
  isGuest: z.boolean().default(false),
});

const participantLeaveSchema = z.object({
  participantIdentity: z.string().min(1),
});

const meetingStatusSyncSchema = z.object({
  status: z.enum(["scheduled", "active", "ended"]),
  startedAt: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Invalid ISO timestamp",
    })
    .nullable()
    .optional(),
  endedAt: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Invalid ISO timestamp",
    })
    .nullable()
    .optional(),
});

/** Validate that speakerUserId (if provided) refers to an existing user. */
async function validateSpeakerUserId(
  speakerUserId: string | null | undefined
): Promise<string | null> {
  if (!speakerUserId) return null;
  const user = await getUserById(speakerUserId);
  if (!user) return null; // Silently drop unknown speaker — don't block transcription
  return user.id;
}

/** Validate that a non-guest participantIdentity refers to an existing user. */
async function validateParticipantUser(
  participantIdentity: string,
  isGuest: boolean
): Promise<boolean> {
  if (isGuest) return true;
  const user = await getUserById(participantIdentity);
  return user !== null;
}

internalRoomAiRoutes.use("*", requireRoomAiWorker);

internalRoomAiRoutes.get(
  "/meetings/by-room/:roomName",
  withErrorHandler("ROOM_AI_MEETING_RESOLVE_FAILED", "Failed to resolve meeting by room name"),
  async (c) => {
    const { roomName } = c.req.param();

    const meeting = await getMeetingByRoomName(roomName);
    if (!meeting) {
      return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    return c.json({ meeting });
  }
);

internalRoomAiRoutes.get(
  "/meetings",
  withErrorHandler("ROOM_AI_MEETINGS_LIST_FAILED", "Failed to list meetings"),
  async (c) => {
    const status = c.req.query("status");

    if (status) {
      const meetings = await listMeetingsByStatus(status);
      return c.json({ meetings });
    }

    return jsonError(c, 400, "ROOM_AI_STATUS_QUERY_REQUIRED", "status query is required");
  }
);

internalRoomAiRoutes.post(
  "/meetings/:id/transcribe",
  zValidator("json", transcribeAudioSchema),
  withErrorHandler("ROOM_AI_TRANSCRIBE_FAILED", "Failed to transcribe meeting audio segment"),
  async (c) => {
    const { id } = c.req.param();
    const data = c.req.valid("json");

    const meeting = await getMeetingById(id);
    if (!meeting) {
      return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    const validatedSpeakerUserId = await validateSpeakerUserId(data.speakerUserId);

    const segment = await transcribeMeetingAudioSegment({
      meetingId: id,
      audioBase64: data.audioBase64,
      mimeType: data.mimeType,
      languageCode: data.languageCode,
      provider: data.provider,
      participantIdentity: data.participantIdentity,
      speakerUserId: validatedSpeakerUserId,
      speakerLabel: data.speakerLabel,
      segmentKey: data.segmentKey,
      startedAt: new Date(data.startedAt),
      finalizedAt: data.finalizedAt ? new Date(data.finalizedAt) : null,
    });

    if (!segment) {
      return jsonError(c, 422, "ROOM_AI_TRANSCRIPT_NOT_RECOGNIZED", "No transcript recognized");
    }

    return c.json({ segment }, 201);
  }
);

internalRoomAiRoutes.post(
  "/meetings/:id/transcript-segments",
  zValidator("json", transcriptSegmentSchema),
  withErrorHandler(
    "ROOM_AI_TRANSCRIPT_INGEST_FAILED",
    "Failed to ingest meeting transcript segment"
  ),
  async (c) => {
    const { id } = c.req.param();
    const data = c.req.valid("json");

    const meeting = await getMeetingById(id);
    if (!meeting) {
      return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    const validatedSpeakerUserId = await validateSpeakerUserId(data.speakerUserId);

    const segment = await upsertTranscriptSegment({
      meetingId: id,
      participantIdentity: data.participantIdentity,
      speakerUserId: validatedSpeakerUserId,
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
  }
);

internalRoomAiRoutes.patch(
  "/meetings/:id/status",
  zValidator("json", meetingStatusSyncSchema),
  withErrorHandler("ROOM_AI_STATUS_SYNC_FAILED", "Failed to sync meeting status"),
  async (c) => {
    const { id } = c.req.param();
    const data = c.req.valid("json");

    const meeting = await getMeetingById(id);
    if (!meeting) {
      return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    const now = new Date();
    const nextStatus = data.status;

    // Skip redundant ended→ended transitions (e.g. from room_finished after endForAll)
    if (meeting.status === "ended" && nextStatus === "ended") {
      return c.json({ meeting });
    }

    const nextMeeting = await updateMeeting(id, {
      status: nextStatus,
      startedAt:
        meeting.startedAt ?? (data.startedAt ? new Date(data.startedAt) : meeting.startedAt),
      endedAt: data.endedAt ? new Date(data.endedAt) : nextStatus === "ended" ? now : null,
    });

    // When meeting ends, close all open participant sessions
    if (nextStatus === "ended") {
      await closeAllParticipantSessions(id, data.endedAt ? new Date(data.endedAt) : now);
    }

    return c.json({ meeting: nextMeeting });
  }
);

// POST /internal/room-ai/meetings/:id/participants/join
internalRoomAiRoutes.post(
  "/meetings/:id/participants/join",
  zValidator("json", participantJoinSchema),
  withErrorHandler("ROOM_AI_PARTICIPANT_JOIN_FAILED", "Failed to record participant join"),
  async (c) => {
    const { id } = c.req.param();
    const data = c.req.valid("json");

    const meeting = await getMeetingById(id);
    if (!meeting) {
      return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    // Validate that non-guest participantIdentity refers to an existing user
    if (!(await validateParticipantUser(data.participantIdentity, data.isGuest))) {
      return jsonError(c, 400, "INVALID_PARTICIPANT", "Participant user not found");
    }

    const participant = await recordParticipantJoin({
      id: crypto.randomUUID(),
      meetingId: id,
      userId: data.isGuest ? null : data.participantIdentity,
      guestIdentity: data.isGuest ? data.participantIdentity : null,
      displayName: data.displayName,
      role: data.isGuest
        ? "guest"
        : meeting.creatorId === data.participantIdentity
          ? "host"
          : "member",
      joinedAt: new Date(),
    });

    return c.json({ participant }, 201);
  }
);

// POST /internal/room-ai/meetings/:id/participants/leave
internalRoomAiRoutes.post(
  "/meetings/:id/participants/leave",
  zValidator("json", participantLeaveSchema),
  withErrorHandler("ROOM_AI_PARTICIPANT_LEAVE_FAILED", "Failed to record participant leave"),
  async (c) => {
    const { id } = c.req.param();
    const data = c.req.valid("json");

    const participant = await recordParticipantLeave(id, data.participantIdentity, new Date());

    return c.json({ participant });
  }
);
