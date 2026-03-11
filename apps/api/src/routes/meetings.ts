import type { MeetingDto, SummaryDto, TranscriptDto } from "@contracts/index";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { generateMeetingSummary } from "../ai/meeting-summary.js";
import type { meetings, summaries, transcripts } from "../db/schema.js";
import { writeAuditLog } from "../lib/audit.js";
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
  provider: z.enum(["google"]),
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
    const allMeetings =
      user.role === "admin" ? await listAllMeetings() : await listMeetingsByUser(user.id);

    return c.json({ meetings: allMeetings.map(toMeetingDto) });
  } catch (error) {
    console.error("Error fetching meetings:", error);
    return c.json({ error: "Failed to fetch meetings" }, 500);
  }
});

// GET /api/meetings/:id - Get meeting details
meetingsRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");

  try {
    const meeting = await getMeetingById(id);

    if (!meeting) {
      return c.json({ error: "Meeting not found" }, 404);
    }

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "read");
    if (!authz.allowed) {
      return c.json({ error: "Forbidden" }, 403);
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
    return c.json({ error: "Failed to fetch meeting" }, 500);
  }
});

// POST /api/meetings - Create new meeting
meetingsRoutes.post("/", zValidator("json", createMeetingSchema), async (c) => {
  const data = c.req.valid("json");
  const user = c.get("user");

  if (!user?.id) {
    return c.json({ error: "Unauthorized" }, 401);
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
      return c.json({ error: "Failed to create meeting" }, 500);
    }

    return c.json({ meeting: toMeetingDto(newMeeting) }, 201);
  } catch (error) {
    console.error("Error creating meeting:", error);
    return c.json({ error: "Failed to create meeting" }, 500);
  }
});

// PUT /api/meetings/:id - Update meeting
meetingsRoutes.put("/:id", zValidator("json", updateMeetingSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");

  try {
    const meeting = await getMeetingById(id);
    if (!meeting) {
      return c.json({ error: "Meeting not found" }, 404);
    }

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "write");
    if (!authz.allowed) {
      return c.json({ error: "Forbidden" }, 403);
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
      return c.json({ error: "Meeting not found" }, 404);
    }

    return c.json({ meeting: toMeetingDto(updatedMeeting) });
  } catch (error) {
    console.error("Error updating meeting:", error);
    return c.json({ error: "Failed to update meeting" }, 500);
  }
});

// DELETE /api/meetings/:id - Delete meeting
meetingsRoutes.delete("/:id", async (c) => {
  const { id } = c.req.param();

  try {
    const meeting = await getMeetingById(id);
    if (!meeting) {
      return c.json({ error: "Meeting not found" }, 404);
    }

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "delete");
    if (!authz.allowed) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const deletedMeeting = await deleteMeeting(id);

    if (!deletedMeeting) {
      return c.json({ error: "Meeting not found" }, 404);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting meeting:", error);
    return c.json({ error: "Failed to delete meeting" }, 500);
  }
});

// POST /api/meetings/:id/transcripts - Add transcript
meetingsRoutes.post("/:id/transcripts", zValidator("json", createTranscriptSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");

  try {
    const meeting = await getMeetingById(id);
    if (!meeting) {
      return c.json({ error: "Meeting not found" }, 404);
    }

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "write");
    if (!authz.allowed) {
      return c.json({ error: "Forbidden" }, 403);
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
      return c.json({ error: "Failed to add transcript" }, 500);
    }

    return c.json({ transcript: toTranscriptDto(newTranscript) }, 201);
  } catch (error) {
    console.error("Error adding transcript:", error);
    return c.json({ error: "Failed to add transcript" }, 500);
  }
});

// POST /api/meetings/:id/summaries - Add AI summary
meetingsRoutes.post("/:id/summaries", zValidator("json", createSummarySchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");

  try {
    const meeting = await getMeetingById(id);
    if (!meeting) {
      return c.json({ error: "Meeting not found" }, 404);
    }

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "write");
    if (!authz.allowed) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const summaryId = crypto.randomUUID();

    const newSummary = await createSummary({
      id: summaryId,
      meetingId: id,
      content: data.content,
      createdAt: new Date(),
    });

    if (!newSummary) {
      return c.json({ error: "Failed to add summary" }, 500);
    }

    return c.json({ summary: toSummaryDto(newSummary) }, 201);
  } catch (error) {
    console.error("Error adding summary:", error);
    return c.json({ error: "Failed to add summary" }, 500);
  }
});

// POST /api/meetings/:id/pipeline/run - Transcribe->Summarize->Wiki (MVP)
meetingsRoutes.post("/:id/pipeline/run", zValidator("json", runPipelineSchema), async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");
  const body = c.req.valid("json");

  try {
    const meeting = await getMeetingById(id);
    if (!meeting) return c.json({ error: "Meeting not found" }, 404);

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "write");
    if (!authz.allowed) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const meetingTranscripts = await getMeetingTranscripts(id);

    if (meetingTranscripts.length === 0) {
      return c.json({ error: "No transcripts found for this meeting" }, 409);
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
    return c.json({ error: "Failed to run room AI pipeline" }, 500);
  }
});

meetingsRoutes.get("/:id/realtime/transcripts", async (c) => {
  const { id } = c.req.param();

  try {
    const meeting = await getMeetingById(id);
    if (!meeting) return c.json({ error: "Meeting not found" }, 404);

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "read");
    if (!authz.allowed) return c.json({ error: "Forbidden" }, 403);

    return c.json({ segments: await listRealtimeTranscriptSegments(id) });
  } catch (error) {
    console.error("Error fetching realtime transcripts:", error);
    return c.json({ error: "Failed to fetch realtime transcripts" }, 500);
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
      if (!meeting) return c.json({ error: "Meeting not found" }, 404);

      const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "write");
      if (!authz.allowed) return c.json({ error: "Forbidden" }, 403);

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
      return c.json({ error: "Failed to upsert realtime transcript" }, 500);
    }
  }
);

meetingsRoutes.get("/:id/agent-events", async (c) => {
  const { id } = c.req.param();

  try {
    const meeting = await getMeetingById(id);
    if (!meeting) return c.json({ error: "Meeting not found" }, 404);

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "read");
    if (!authz.allowed) return c.json({ error: "Forbidden" }, 403);

    return c.json({ events: await listMeetingAgentTimeline(id) });
  } catch (error) {
    console.error("Error fetching meeting agent events:", error);
    return c.json({ error: "Failed to fetch meeting agent events" }, 500);
  }
});

meetingsRoutes.get("/:id/agents/active", async (c) => {
  const { id } = c.req.param();

  try {
    const meeting = await getMeetingById(id);
    if (!meeting) return c.json({ error: "Meeting not found" }, 404);

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "read");
    if (!authz.allowed) return c.json({ error: "Forbidden" }, 403);

    return c.json({ sessions: await listActiveAgentSessions(id) });
  } catch (error) {
    console.error("Error fetching active meeting agent sessions:", error);
    return c.json({ error: "Failed to fetch active meeting agent sessions" }, 500);
  }
});

meetingsRoutes.post("/:id/agents/:agentId/invoke", async (c) => {
  const { id, agentId } = c.req.param();
  const user = c.get("user");

  try {
    const meeting = await getMeetingById(id);
    if (!meeting) return c.json({ error: "Meeting not found" }, 404);

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "write");
    if (!authz.allowed) return c.json({ error: "Forbidden" }, 403);

    const result = await invokeMeetingAgent({
      meetingId: id,
      agentId,
      invokedByUserId: user.id,
    });

    if (!result) return c.json({ error: "Agent not found or inactive" }, 404);
    return c.json(result, result.reused ? 200 : 201);
  } catch (error) {
    console.error("Error invoking meeting agent:", error);
    return c.json({ error: "Failed to invoke meeting agent" }, 500);
  }
});

meetingsRoutes.post("/:id/agents/:agentId/leave", async (c) => {
  const { id, agentId } = c.req.param();
  const user = c.get("user");

  try {
    const meeting = await getMeetingById(id);
    if (!meeting) return c.json({ error: "Meeting not found" }, 404);

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "write");
    if (!authz.allowed) return c.json({ error: "Forbidden" }, 403);

    const session = await leaveMeetingAgent({
      meetingId: id,
      agentId,
      triggeredByUserId: user.id,
    });

    if (!session) return c.json({ error: "Active agent session not found" }, 404);
    return c.json({ session });
  } catch (error) {
    console.error("Error leaving meeting agent:", error);
    return c.json({ error: "Failed to end meeting agent session" }, 500);
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
      if (!meeting) return c.json({ error: "Meeting not found" }, 404);

      const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "write");
      if (!authz.allowed) return c.json({ error: "Forbidden" }, 403);

      const response = await generateMeetingAgentResponse({
        meetingId: id,
        agentId,
        prompt: data.prompt,
        triggeredByUserId: user.id,
        languageCode: data.languageCode,
      });

      if (!response) {
        return c.json({ error: "Active agent session not found" }, 404);
      }

      return c.json(response);
    } catch (error) {
      console.error("Error generating meeting agent response:", error);
      return c.json({ error: "Failed to generate meeting agent response" }, 500);
    }
  }
);
