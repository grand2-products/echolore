import { UserRole } from "@echolore/shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { jsonError, tryCatchResponse, withErrorHandler } from "../../lib/api-error.js";
import { auditAction } from "../../lib/audit.js";
import type { AppEnv } from "../../lib/auth.js";
import { roomService } from "../../lib/livekit-client.js";
import { parsePaginationParams } from "../../lib/pagination.js";
import { authorizeOwnerResource } from "../../policies/authorization-policy.js";
import {
  deleteCalendarEvent,
  syncMeetingToCalendar,
  updateCalendarEvent,
} from "../../services/calendar/google-calendar-sync-service.js";
import {
  closeAllParticipantSessions,
  countAllMeetings,
  countMeetingsByUser,
  createMeeting,
  deleteMeeting,
  getActiveParticipantCounts,
  getMeetingById,
  getMeetingSummaries,
  getMeetingTranscripts,
  listAllMeetings,
  listMeetingParticipants,
  listMeetingsByUser,
  updateMeeting,
} from "../../services/meeting/meeting-service.js";
import { toMeetingDto, toMeetingParticipantDto, toSummaryDto, toTranscriptDto } from "./dto.js";
import { createMeetingSchema, updateMeetingSchema } from "./schemas.js";

export const meetingCrudRoutes = new Hono<AppEnv>();

// GET /api/meetings - List all meetings
meetingCrudRoutes.get(
  "/",
  withErrorHandler("MEETINGS_LIST_FAILED", "Failed to fetch meetings"),
  async (c) => {
    const user = c.get("user");

    const { limit, offset } = parsePaginationParams(c);
    const isAdmin = user.role === UserRole.Admin;

    const [meetings, total] = await Promise.all([
      isAdmin ? listAllMeetings({ limit, offset }) : listMeetingsByUser(user.id, { limit, offset }),
      isAdmin ? countAllMeetings() : countMeetingsByUser(user.id),
    ]);

    // Fetch active participant counts for active meetings in a single query
    const activeMeetingIds = meetings.filter((m) => m.status === "active").map((m) => m.id);
    const participantCounts = await getActiveParticipantCounts(activeMeetingIds);

    return c.json({
      meetings: meetings.map((m) => ({
        ...toMeetingDto(m),
        activeParticipantCount:
          m.status === "active" ? (participantCounts.get(m.id) ?? 0) : undefined,
      })),
      total,
    });
  }
);

// GET /api/meetings/:id - Get meeting details
meetingCrudRoutes.get(
  "/:id",
  withErrorHandler("MEETING_FETCH_FAILED", "Failed to fetch meeting"),
  async (c) => {
    const { id } = c.req.param();

    const meeting = await getMeetingById(id);

    if (!meeting) {
      return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creator_id, "read");
    if (!authz.allowed) {
      return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");
    }

    const meetingTranscripts = await getMeetingTranscripts(id);

    const meetingSummaries = await getMeetingSummaries(id);

    await auditAction(c, "meeting.record.view", "meeting", id, {
      transcriptCount: meetingTranscripts.length,
      summaryCount: meetingSummaries.length,
      hasMinutes: meetingTranscripts.length > 0 || meetingSummaries.length > 0,
    });

    return c.json({
      meeting: toMeetingDto(meeting),
      transcripts: meetingTranscripts.map(toTranscriptDto),
      summaries: meetingSummaries.map(toSummaryDto),
    });
  }
);

// GET /api/meetings/:id/participants - List meeting participants
meetingCrudRoutes.get(
  "/:id/participants",
  withErrorHandler("MEETING_PARTICIPANTS_FAILED", "Failed to fetch meeting participants"),
  async (c) => {
    const { id } = c.req.param();

    const meeting = await getMeetingById(id);
    if (!meeting) {
      return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creator_id, "read");
    if (!authz.allowed) {
      return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");
    }

    const participants = await listMeetingParticipants(id);
    return c.json({ participants: participants.map(toMeetingParticipantDto) });
  }
);

// POST /api/meetings - Create new meeting
meetingCrudRoutes.post("/", zValidator("json", createMeetingSchema), async (c) => {
  const user = c.get("user");

  if (!user?.id) {
    return jsonError(c, 401, "UNAUTHORIZED", "Unauthorized");
  }

  return tryCatchResponse(
    c,
    async () => {
      const data = c.req.valid("json");
      const user = c.get("user");
      const id = crypto.randomUUID();
      const roomName = `room-${id}`;
      const now = new Date();

      const newMeeting = await createMeeting({
        id,
        title: data.title,
        creatorId: user.id,
        roomName,
        status: "scheduled",
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        createdAt: now,
      });

      if (!newMeeting) {
        return jsonError(c, 500, "MEETING_CREATE_FAILED", "Failed to create meeting");
      }

      // Best-effort calendar sync
      try {
        await syncMeetingToCalendar(id, user.id, {
          attendeeEmails: data.attendeeEmails,
        });
      } catch {
        // Calendar sync is optional
      }

      return c.json({ meeting: toMeetingDto(newMeeting) }, 201);
    },
    "MEETING_CREATE_FAILED",
    "Failed to create meeting"
  );
});

// PUT /api/meetings/:id - Update meeting
meetingCrudRoutes.put(
  "/:id",
  zValidator("json", updateMeetingSchema),
  withErrorHandler("MEETING_UPDATE_FAILED", "Failed to update meeting"),
  async (c) => {
    const { id } = c.req.param();
    const data = c.req.valid("json");
    const user = c.get("user");

    const meeting = await getMeetingById(id);
    if (!meeting) {
      return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creator_id, "write");
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

    // Best-effort calendar sync
    try {
      await updateCalendarEvent(id, user.id);
    } catch {
      // Calendar sync is optional
    }

    return c.json({ meeting: toMeetingDto(updatedMeeting) });
  }
);

// DELETE /api/meetings/:id - Delete meeting
meetingCrudRoutes.delete(
  "/:id",
  withErrorHandler("MEETING_DELETE_FAILED", "Failed to delete meeting"),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get("user");

    const meeting = await getMeetingById(id);
    if (!meeting) {
      return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creator_id, "delete");
    if (!authz.allowed) {
      return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");
    }

    // Best-effort calendar sync
    try {
      await deleteCalendarEvent(id, user.id);
    } catch {
      // Calendar sync is optional
    }

    const deletedMeeting = await deleteMeeting(id);

    if (!deletedMeeting) {
      return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    return c.json({ success: true });
  }
);

// POST /api/meetings/:id/end - End meeting for all participants
meetingCrudRoutes.post(
  "/:id/end",
  withErrorHandler("MEETING_END_FAILED", "Failed to end meeting"),
  async (c) => {
    const { id } = c.req.param();

    const meeting = await getMeetingById(id);
    if (!meeting) {
      return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
    }

    const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creator_id, "write");
    if (!authz.allowed) {
      return jsonError(c, 403, "MEETING_FORBIDDEN", "Forbidden");
    }

    if (meeting.status !== "active") {
      return jsonError(c, 400, "MEETING_NOT_ACTIVE", "Meeting is not currently active");
    }

    const now = new Date();

    // Update meeting + close participant sessions concurrently
    const [updatedMeeting] = await Promise.all([
      updateMeeting(id, { status: "ended", ended_at: now }),
      closeAllParticipantSessions(id, now),
    ]);

    // Delete LiveKit room to force-disconnect all participants
    try {
      await roomService.deleteRoom(meeting.roomName);
    } catch {
      // Room may already be empty — best-effort
    }

    // Best-effort calendar sync
    try {
      await updateCalendarEvent(id, c.get("user").id);
    } catch {
      // Calendar sync is optional
    }

    await auditAction(c, "meeting.end_for_all", "meeting", id);

    return c.json({ meeting: updatedMeeting ? toMeetingDto(updatedMeeting) : null });
  }
);
