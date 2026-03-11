import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { requireRoomAiWorker } from "../lib/internal-auth.js";
import {
  getMeetingById,
  getMeetingByRoomName,
  listMeetingsByStatus,
  updateMeeting,
} from "../repositories/meeting/meeting-repository.js";
import {
  transcribeMeetingAudioSegment,
  upsertTranscriptSegment,
} from "../services/meeting/meeting-realtime-service.js";

export const internalRoomAiRoutes = new Hono();

const transcribeAudioSchema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string().min(1),
  languageCode: z.string().min(2),
  provider: z.enum(["google"]).optional(),
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

internalRoomAiRoutes.use("*", requireRoomAiWorker);

internalRoomAiRoutes.get("/meetings/by-room/:roomName", async (c) => {
  const { roomName } = c.req.param();

  try {
    const meeting = await getMeetingByRoomName(roomName);
    if (!meeting) {
      return c.json({ error: "Meeting not found" }, 404);
    }

    return c.json({ meeting });
  } catch (error) {
    console.error("Error resolving meeting by room name:", error);
    return c.json({ error: "Failed to resolve meeting by room name" }, 500);
  }
});

internalRoomAiRoutes.get("/meetings", async (c) => {
  const status = c.req.query("status");

  try {
    if (status) {
      const meetings = await listMeetingsByStatus(status);
      return c.json({ meetings });
    }

    return c.json({ error: "status query is required" }, 400);
  } catch (error) {
    console.error("Error listing meetings for room AI worker:", error);
    return c.json({ error: "Failed to list meetings" }, 500);
  }
});

internalRoomAiRoutes.post(
  "/meetings/:id/transcribe",
  zValidator("json", transcribeAudioSchema),
  async (c) => {
    const { id } = c.req.param();
    const data = c.req.valid("json");

    try {
      const meeting = await getMeetingById(id);
      if (!meeting) {
        return c.json({ error: "Meeting not found" }, 404);
      }

      const segment = await transcribeMeetingAudioSegment({
        meetingId: id,
        audioBase64: data.audioBase64,
        mimeType: data.mimeType,
        languageCode: data.languageCode,
        provider: data.provider,
        participantIdentity: data.participantIdentity,
        speakerUserId: data.speakerUserId ?? null,
        speakerLabel: data.speakerLabel,
        segmentKey: data.segmentKey,
        startedAt: new Date(data.startedAt),
        finalizedAt: data.finalizedAt ? new Date(data.finalizedAt) : null,
      });

      if (!segment) {
        return c.json({ error: "No transcript recognized" }, 422);
      }

      return c.json({ segment }, 201);
    } catch (error) {
      console.error("Error transcribing meeting audio segment:", error);
      return c.json({ error: "Failed to transcribe meeting audio segment" }, 500);
    }
  }
);

internalRoomAiRoutes.post(
  "/meetings/:id/transcript-segments",
  zValidator("json", transcriptSegmentSchema),
  async (c) => {
    const { id } = c.req.param();
    const data = c.req.valid("json");

    try {
      const meeting = await getMeetingById(id);
      if (!meeting) {
        return c.json({ error: "Meeting not found" }, 404);
      }

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
    } catch (error) {
      console.error("Error ingesting meeting transcript segment:", error);
      return c.json({ error: "Failed to ingest meeting transcript segment" }, 500);
    }
  }
);

internalRoomAiRoutes.patch(
  "/meetings/:id/status",
  zValidator("json", meetingStatusSyncSchema),
  async (c) => {
    const { id } = c.req.param();
    const data = c.req.valid("json");

    try {
      const meeting = await getMeetingById(id);
      if (!meeting) {
        return c.json({ error: "Meeting not found" }, 404);
      }

      const nextMeeting = await updateMeeting(id, {
        status: data.status,
        startedAt:
          meeting.startedAt ?? (data.startedAt ? new Date(data.startedAt) : meeting.startedAt),
        endedAt: data.endedAt
          ? new Date(data.endedAt)
          : data.status === "ended"
            ? new Date()
            : null,
      });

      return c.json({ meeting: nextMeeting });
    } catch (error) {
      console.error("Error syncing meeting status:", error);
      return c.json({ error: "Failed to sync meeting status" }, 500);
    }
  }
);
