import { UserRole } from "@corp-internal/shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { auditAction } from "../../lib/audit.js";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { parsePaginationParams } from "../../lib/pagination.js";
import { authorizeOwnerResource } from "../../policies/authorization-policy.js";
import {
  createMeeting,
  deleteMeeting,
  getMeetingById,
  getMeetingSummaries,
  getMeetingTranscripts,
  listAllMeetings,
  listMeetingsByUser,
  updateMeeting,
} from "../../repositories/meeting/meeting-repository.js";
import { syncMeetingToCalendar, updateCalendarEvent, deleteCalendarEvent } from "../../services/calendar/google-calendar-sync-service.js";
import { toMeetingDto, toTranscriptDto, toSummaryDto } from "./dto.js";
import { createMeetingSchema, updateMeetingSchema } from "./schemas.js";

export const meetingCrudRoutes = new Hono<AppEnv>();

// GET /api/meetings - List all meetings
meetingCrudRoutes.get("/", withErrorHandler(async (c) => {
  const user = c.get("user");

  const { limit, offset } = parsePaginationParams(c);
  const allMeetings =
    user.role === UserRole.Admin ? await listAllMeetings() : await listMeetingsByUser(user.id);

  return c.json({
    meetings: allMeetings.slice(offset, offset + limit).map(toMeetingDto),
    total: allMeetings.length,
  });
}, "MEETINGS_LIST_FAILED", "Failed to fetch meetings"));

// GET /api/meetings/:id - Get meeting details
meetingCrudRoutes.get("/:id", withErrorHandler(async (c) => {
  const { id } = c.req.param();

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
}, "MEETING_FETCH_FAILED", "Failed to fetch meeting"));

// POST /api/meetings - Create new meeting
meetingCrudRoutes.post("/", zValidator("json", createMeetingSchema), async (c) => {
  const user = c.get("user");

  if (!user?.id) {
    return jsonError(c, 401, "UNAUTHORIZED", "Unauthorized");
  }

  return withErrorHandler(async (c) => {
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
  }, "MEETING_CREATE_FAILED", "Failed to create meeting")(c);
});

// PUT /api/meetings/:id - Update meeting
meetingCrudRoutes.put("/:id", zValidator("json", updateMeetingSchema), withErrorHandler(async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");
  const user = c.get("user");

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

  // Best-effort calendar sync
  try {
    await updateCalendarEvent(id, user.id);
  } catch {
    // Calendar sync is optional
  }

  return c.json({ meeting: toMeetingDto(updatedMeeting) });
}, "MEETING_UPDATE_FAILED", "Failed to update meeting"));

// DELETE /api/meetings/:id - Delete meeting
meetingCrudRoutes.delete("/:id", withErrorHandler(async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");

  const meeting = await getMeetingById(id);
  if (!meeting) {
    return jsonError(c, 404, "MEETING_NOT_FOUND", "Meeting not found");
  }

  const authz = await authorizeOwnerResource(c, "meeting", id, meeting.creatorId, "delete");
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
}, "MEETING_DELETE_FAILED", "Failed to delete meeting"));
