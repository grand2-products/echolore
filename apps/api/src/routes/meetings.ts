import type { MeetingDto, SummaryDto, TranscriptDto } from "@contracts/index";
import { UserRole } from "@corp-internal/shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { generateMeetingSummary } from "../ai/meeting-summary.js";
import type { meetings, summaries, transcripts } from "../db/schema.js";
import { writeAuditLog } from "../lib/audit.js";
import { jsonError } from "../lib/api-error.js";
import type { AppEnv } from "../lib/auth.js";
import { authorizeOwnerResource } from "../policies/authorization-policy.js";
import {
  createMeeting,
  createSummary,
  createTranscript,
  deleteMeeting,
  getMeetingById,
  getMeetingSummaries,
  getMeetingTranscripts,
  listAllMeetings,
  listMeetingsByUser,
  updateMeeting,
} from "../repositories/meeting/meeting-repository.js";
import { generateMeetingAgentResponse } from "../services/meeting/meeting-agent-runtime-service.js";
import {
  invokeMeetingAgent,
  leaveMeetingAgent,
  listActiveAgentSessions,
  listMeetingAgentTimeline,
  listRealtimeTranscriptSegments,
  upsertTranscriptSegment,
} from "../services/meeting/meeting-realtime-service.js";
import {
  createMeetingSummaryWikiArtifacts,
  getExistingRoomAiPipelineResult,
} from "../services/meeting/meeting-service.js";

export const meetingsRoutes = new Hono<AppEnv>();

const toIso = (value: Date | null): string | null => (value ? value.toISOString() : null);

const toMeetingDto = (meeting: typeof meetings.$inferSelect): MeetingDto => ({
  id: meeting.id,
  title: meeting.title,
  creatorId: meeting.creatorId,
  roomName: meeting.roomName,
  status: meeting.status as MeetingDto["status"],
  startedAt: toIso(meeting.startedAt),
  endedAt: toIso(meeting.endedAt),
  createdAt: meeting.createdAt.toISOString(),
});

const toTranscriptDto = (transcript: typeof transcripts.$inferSelect): TranscriptDto => ({
  id: transcript.id,
  meetingId: transcript.meetingId,
  speakerId: transcript.speakerId,
  content: transcript.content,
  timestamp: transcript.timestamp.toISOString(),
  createdAt: transcript.createdAt.toISOString(),
});

const toSummaryDto = (summary: typeof summaries.$inferSelect): SummaryDto => ({
  id: summary.id,
  meetingId: summary.meetingId,
  content: summary.content,
  createdAt: summary.createdAt.toISOString(),
});

// Validation schemas
const createMeetingSchema = z.object({
  title: z.string().min(1),
  scheduledAt: z.string().optional(),
});

const updateMeetingSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(["scheduled", "active", "ended"]).optional(),
});

const createTranscriptSchema = z.object({
  speakerId: z.string().optional(),
  content: z.string().min(1),
  timestamp: z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
    message: "Invalid ISO timestamp",
  }),
});

const createSummarySchema = z.object({
  content: z.string().min(1),
});

const runPipelineSchema = z.object({
  title: z.string().min(1).optional(),
});
const realtimeTranscriptSchema = z.object({
  participantIdentity: z.string().min(1),
  speakerUserId: z.string().nullable().optional(),
  speakerLabel: z.string().min(1),
  content: z.string().min(1),
  isPartial: z.boolean(),
  segmentKey: z.string().min(1),
  provider: z.enum(["google", "vertex", "zhipu"]),
  confidence: z.number().nullable().optional(),
  startedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
    message: "Invalid ISO timestamp",
  }),
  finalizedAt: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), {
      message: "Invalid ISO timestamp",
    })
    .nullable()
    .optional(),
});
const agentRespondSchema = z.object({
  prompt: z.string().min(1),
  languageCode: z.string().min(2).optional(),
});

// GET /api/meetings - List all meetings
meetingsRoutes.get("/", async (c) => {
  const user = c.get("user");

  try {
    const limit = Math.min(Number(c.req.query("limit")) || 100, 500);
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
    const allMeetings =
      user.role === UserRole.Admin ? await listAllMeetings() : await listMeetingsByUser(user.id);

    return c.json({
      meetings: allMeetings.slice(offset, offset + limit).map(toMeetingDto),
      total: allMeetings.length,
    });
  } catch (error) {
    console.error("Error fetching meetings:", error);
    return jsonError(c, 500, "MEETINGS_LIST_FAILED", "Failed to fetch meetings");
  }
});

// GET /api/meetings/:id - Get meeting details
meetingsRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");

  try {
    const meeting = await getMeetingById(id);

    if (!meeting) {
      return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "read");
    if (!authz.allowed) {
      return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");
    }

    const meetingTranscripts = await getMeetingTranscripts(id);

    const meetingSummaries = await getMeetingSummaries(id);

    await writeAuditLog({
      actorUserId: user?.id ?? null,
      actorEmail: user?.email ?? null,
      action: "meeting.record.view",
      resourceType: "meeting",
      resourceId: id,
      metadata: {
        transcriptCount: meetingTranscripts.length,
        summaryCount: meetingSummaries.length,
        hasMinutes: meetingTranscripts.length > 0 || meetingSummaries.length > 0,
      },
      ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    });

    return c.json({
      meeting: toMeetingDto(meeting),
      transcripts: meetingTranscripts.map(toTranscriptDto),
      summaries: meetingSummaries.map(toSummaryDto),
    });
  } catch (error) {
    console.error("Error fetching meeting:", error);
    return jsonError(c, 500, "MEETING_FETCH_FAILED", "Failed to fetch meeting");
  }
});

// POST /api/meetings - Create new meeting
meetingsRoutes.post("/", zValidator("json", createMeetingSchema), async (c) => {
  const data = c.req.valid("json");
  const user = c.get("user");

  if (!user?.id) {
    return jsonError(c, 401, "UNAUTHORIZED", "Unauthorized");
  }

  try {
    const id = crypto.randomUUID();
    const roomName = `room-${id}`;
    const now = new Date();

    const newMeeting = await createMeeting({
      id,
      title: data.title,
      creatorId: user.id,
      roomName,
      status: "scheduled",
      createdAt: now,
    });

    if (!newMeeting) {
      return jsonError(c, 500, "MEETING_CREATE_FAILED", "Failed to create meeting");
    }

    return c.json({ meeting: toMeetingDto(newMeeting) }, 201);
  } catch (error) {
    console.error("Error creating meeting:", error);
    return jsonError(c, 500, "MEETING_CREATE_FAILED", "Failed to create meeting");
  }
});

// PUT /api/meetings/:id - Update meeting
meetingsRoutes.put("/:id", zValidator("json", updateMeetingSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");

  try {
    const meeting = await getMeetingById(id);
    if (!meeting) {
      return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "write");
    if (!authz.allowed) {
      return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");
    }

    const updateData: Record<string, unknown> = {};

    if (data.title) updateData.title = data.title;
    if (data.status) {
      updateData.status = data.status;
      if (data.status === "active") {
        updateData.startedAt = new Date();
      } else if (data.status === "ended") {
        updateData.endedAt = new Date();
      }
    }

    const updatedMeeting = await updateMeeting(id, updateData);

    if (!updatedMeeting) {
      return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    return c.json({ meeting: toMeetingDto(updatedMeeting) });
  } catch (error) {
    console.error("Error updating meeting:", error);
    return jsonError(c, 500, "MEETING_UPDATE_FAILED", "Failed to update meeting");
  }
});

// DELETE /api/meetings/:id - Delete meeting
meetingsRoutes.delete("/:id", async (c) => {
  const { id } = c.req.param();

  try {
    const meeting = await getMeetingById(id);
    if (!meeting) {
      return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "delete");
    if (!authz.allowed) {
      return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");
    }

    const deletedMeeting = await deleteMeeting(id);

    if (!deletedMeeting) {
      return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting meeting:", error);
    return jsonError(c, 500, "MEETING_DELETE_FAILED", "Failed to delete meeting");
  }
});

// POST /api/meetings/:id/transcripts - Add transcript
meetingsRoutes.post("/:id/transcripts", zValidator("json", createTranscriptSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");

  try {
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
  } catch (error) {
    console.error("Error adding transcript:", error);
    return jsonError(c, 500, "MEETING_TRANSCRIPT_CREATE_FAILED", "Failed to add transcript");
  }
});

// POST /api/meetings/:id/summaries - Add AI summary
meetingsRoutes.post("/:id/summaries", zValidator("json", createSummarySchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");

  try {
    const meeting = await getMeetingById(id);
    if (!meeting) {
      return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "write");
    if (!authz.allowed) {
      return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");
    }

    const summaryId = crypto.randomUUID();

    const newSummary = await createSummary({
      id: summaryId,
      meetingId: id,
      content: data.content,
      createdAt: new Date(),
    });

    if (!newSummary) {
      return jsonError(c, 500, "MEETING_SUMMARY_CREATE_FAILED", "Failed to add summary");
    }

    return c.json({ summary: toSummaryDto(newSummary) }, 201);
  } catch (error) {
    console.error("Error adding summary:", error);
    return jsonError(c, 500, "MEETING_SUMMARY_CREATE_FAILED", "Failed to add summary");
  }
});

// POST /api/meetings/:id/pipeline/run - Transcribe->Summarize->Wiki (MVP)
meetingsRoutes.post("/:id/pipeline/run", zValidator("json", runPipelineSchema), async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const body = c.req.valid("json");

  try {
    const meeting = await getMeetingById(id);
    if (!meeting) return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "write");
    if (!authz.allowed) {
      return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");
    }

    let meetingTranscripts = await getMeetingTranscripts(id);

    // If no transcripts exist, try to transcribe from a completed recording
    if (meetingTranscripts.length === 0) {
      try {
        const { maybeTranscribeCompletedRecording } = await import(
          "../services/meeting/recording-transcription-service.js"
        );
        await maybeTranscribeCompletedRecording(id);
        meetingTranscripts = await getMeetingTranscripts(id);
      } catch {
        // transcription failed, continue with empty check below
      }
    }

    if (meetingTranscripts.length === 0) {
      return jsonError(
        c,
        409,
        "MEETING_PIPELINE_TRANSCRIPTS_MISSING",
        "No transcripts found for this meeting"
      );
    }

    const existingPipelineResult = await getExistingRoomAiPipelineResult(id);
    if (existingPipelineResult) {
      await writeAuditLog({
        actorUserId: user?.id ?? null,
        actorEmail: user?.email ?? null,
        action: "roomai.pipeline.reused",
        resourceType: "meeting",
        resourceId: meeting.id,
        metadata: {
          transcriptCount: meetingTranscripts.length,
          summaryId: existingPipelineResult.summary.id,
          wikiPageId: existingPipelineResult.wikiPage.id,
        },
        ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
        userAgent: c.req.header("user-agent") ?? null,
      });

      return c.json({
        meetingId: meeting.id,
        summary: toSummaryDto(existingPipelineResult.summary),
        wikiPage: existingPipelineResult.wikiPage,
        reused: true,
      });
    }

    const summaryContent = await generateMeetingSummary(
      body.title ?? meeting.title,
      meetingTranscripts
    );

    const { summary: createdSummary, wikiPage } = await createMeetingSummaryWikiArtifacts(
      meeting,
      summaryContent
    );

    await writeAuditLog({
      actorUserId: user?.id ?? null,
      actorEmail: user?.email ?? null,
      action: "roomai.pipeline.run",
      resourceType: "meeting",
      resourceId: meeting.id,
      metadata: {
        transcriptCount: meetingTranscripts.length,
        summaryId: createdSummary.id,
        wikiPageId: wikiPage.id,
        reused: false,
      },
      ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    });

    return c.json({
      meetingId: meeting.id,
      summary: toSummaryDto(createdSummary),
      wikiPage,
      reused: false,
    });
  } catch (error) {
    console.error("Error running room AI pipeline:", error);
    return jsonError(c, 500, "MEETING_PIPELINE_RUN_FAILED", "Failed to run room AI pipeline");
  }
});

meetingsRoutes.get("/:id/realtime/transcripts", async (c) => {
  const { id } = c.req.param();

  try {
    const meeting = await getMeetingById(id);
    if (!meeting) return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "read");
    if (!authz.allowed) return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");

    return c.json({ segments: await listRealtimeTranscriptSegments(id) });
  } catch (error) {
    console.error("Error fetching realtime transcripts:", error);
    return jsonError(
      c,
      500,
      "MEETING_REALTIME_TRANSCRIPTS_FETCH_FAILED",
      "Failed to fetch realtime transcripts"
    );
  }
});

meetingsRoutes.post(
  "/:id/realtime/transcripts",
  zValidator("json", realtimeTranscriptSchema),
  async (c) => {
    const { id } = c.req.param();
    const data = c.req.valid("json");

    try {
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
    } catch (error) {
      console.error("Error upserting realtime transcript:", error);
      return jsonError(
        c,
        500,
        "MEETING_REALTIME_TRANSCRIPT_UPSERT_FAILED",
        "Failed to upsert realtime transcript"
      );
    }
  }
);

meetingsRoutes.get("/:id/agent-events", async (c) => {
  const { id } = c.req.param();

  try {
    const meeting = await getMeetingById(id);
    if (!meeting) return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "read");
    if (!authz.allowed) return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");

    return c.json({ events: await listMeetingAgentTimeline(id) });
  } catch (error) {
    console.error("Error fetching meeting agent events:", error);
    return jsonError(
      c,
      500,
      "MEETING_AGENT_EVENTS_FETCH_FAILED",
      "Failed to fetch meeting agent events"
    );
  }
});

meetingsRoutes.get("/:id/agents/active", async (c) => {
  const { id } = c.req.param();

  try {
    const meeting = await getMeetingById(id);
    if (!meeting) return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "read");
    if (!authz.allowed) return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");

    return c.json({ sessions: await listActiveAgentSessions(id) });
  } catch (error) {
    console.error("Error fetching active meeting agent sessions:", error);
    return jsonError(
      c,
      500,
      "MEETING_AGENT_SESSIONS_FETCH_FAILED",
      "Failed to fetch active meeting agent sessions"
    );
  }
});

meetingsRoutes.post("/:id/agents/:agentId/invoke", async (c) => {
  const { id, agentId } = c.req.param();
  const user = c.get("user");

  try {
    const meeting = await getMeetingById(id);
    if (!meeting) return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "write");
    if (!authz.allowed) return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");

    const result = await invokeMeetingAgent({
      meetingId: id,
      agentId,
      invokedByUserId: user.id,
    });

    if (!result) {
      return jsonError(c, 404, "MEETING_AGENT_NOT_FOUND_OR_INACTIVE", "Agent not found or inactive");
    }
    return c.json(result, result.reused ? 200 : 201);
  } catch (error) {
    console.error("Error invoking meeting agent:", error);
    return jsonError(c, 500, "MEETING_AGENT_INVOKE_FAILED", "Failed to invoke meeting agent");
  }
});

meetingsRoutes.post("/:id/agents/:agentId/leave", async (c) => {
  const { id, agentId } = c.req.param();
  const user = c.get("user");

  try {
    const meeting = await getMeetingById(id);
    if (!meeting) return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "write");
    if (!authz.allowed) return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");

    const session = await leaveMeetingAgent({
      meetingId: id,
      agentId,
      triggeredByUserId: user.id,
    });

    if (!session) {
      return jsonError(c, 404, "MEETING_AGENT_SESSION_NOT_FOUND", "Active agent session not found");
    }
    return c.json({ session });
  } catch (error) {
    console.error("Error leaving meeting agent:", error);
    return jsonError(c, 500, "MEETING_AGENT_LEAVE_FAILED", "Failed to end meeting agent session");
  }
});

meetingsRoutes.post(
  "/:id/agents/:agentId/respond",
  zValidator("json", agentRespondSchema),
  async (c) => {
    const { id, agentId } = c.req.param();
    const user = c.get("user");
    const data = c.req.valid("json");

    try {
      const meeting = await getMeetingById(id);
      if (!meeting) return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");

      const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "write");
      if (!authz.allowed) return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");

      const response = await generateMeetingAgentResponse({
        meetingId: id,
        agentId,
        prompt: data.prompt,
        triggeredByUserId: user.id,
        languageCode: data.languageCode,
      });

      if (!response) {
        return jsonError(c, 404, "MEETING_AGENT_SESSION_NOT_FOUND", "Active agent session not found");
      }

      return c.json(response);
    } catch (error) {
      console.error("Error generating meeting agent response:", error);
      return jsonError(
        c,
        500,
        "MEETING_AGENT_RESPONSE_FAILED",
        "Failed to generate meeting agent response"
      );
    }
  }
);
