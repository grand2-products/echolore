import type { Meeting, Summary } from "../../db/schema.js";
import { writeAuditLog } from "../../lib/audit.js";
import { roomService } from "../../lib/livekit-client.js";
import { closeActiveMeetingAgentSessions } from "../../repositories/meeting/meeting-realtime-repository.js";
import {
  closeAllParticipantSessions,
  createMeetingSummaryArtifactsTx,
  endMeetingIfNotEnded,
  ensureMeetingNotesPage,
  getLatestMeetingSummary,
  getMeetingByRoomName,
  getRoomAiWikiPageByMeetingId,
} from "../../repositories/meeting/meeting-repository.js";
import { updateCalendarEvent } from "../calendar/google-calendar-sync-service.js";
import { GENERAL_SPACE_ID } from "../wiki/space-service.js";

// Re-export repository CRUD for route layer access
export {
  closeAllParticipantSessions,
  countAllMeetings,
  countMeetingsByUser,
  createMeeting,
  createSummary,
  createTranscript,
  deleteMeeting,
  endMeetingIfNotEnded,
  getActiveParticipantCounts,
  getMeetingById,
  getMeetingByRoomName,
  getMeetingSummaries,
  getMeetingTranscripts,
  listAllMeetings,
  listMeetingParticipants,
  listMeetingsByStatus,
  listMeetingsByUser,
  recordParticipantJoin,
  recordParticipantLeave,
  updateMeeting,
} from "../../repositories/meeting/meeting-repository.js";

/** Fixed ID for the "Meeting Notes" parent page in General Space. */
export const MEETING_NOTES_PAGE_ID = "00000000-0000-0000-0000-000000000002";

/**
 * Reason a meeting was closed; flows into the audit-log metadata so the two
 * end paths (manual end-for-all vs LiveKit room_finished) can be told apart.
 */
export type CloseMeetingReason = "end_for_all" | "room_finished" | "monitor_stale";

export interface CloseMeetingOptions {
  reason: CloseMeetingReason;
  endedAt: Date;
  /**
   * Actor for the audit log. The webhook fast path has no user, so this is
   * optional; the audit row is still written with a null actor.
   */
  actor?: { userId?: string | null; email?: string | null } | null;
  /** When true, also deletes the LiveKit room to force-disconnect peers. */
  deleteLiveKitRoom?: boolean;
  /** When true, attempts a calendar sync (requires an actor with a userId). */
  syncCalendar?: boolean;
  /** Optional request metadata to attach to the audit log. */
  audit?: {
    ipAddress?: string | null;
    userAgent?: string | null;
  };
}

/**
 * Close a meeting and run the shared side effects: close participant sessions,
 * optionally delete the LiveKit room, optionally sync the calendar event, and
 * write the audit log. Atomic on the `meetings` row: if another caller already
 * closed it (idempotent CAS), this returns null and runs no side effects.
 *
 * Used by both the manual `/meetings/:id/end` route and the room_finished
 * webhook fast path so the audit trail and calendar state don't depend on
 * which path won the race.
 */
export async function closeMeetingWithSideEffects(
  meeting: Meeting,
  options: CloseMeetingOptions
): Promise<Meeting | null> {
  // PR-Charlie #H2: close any still-active agent sessions so the autonomous
  // evaluator stops touching this meeting even before
  // `listAutonomousActiveSessions`' meeting-status filter picks up the change.
  const [updatedMeeting] = await Promise.all([
    endMeetingIfNotEnded(meeting.id, options.endedAt),
    closeAllParticipantSessions(meeting.id, options.endedAt),
    closeActiveMeetingAgentSessions(meeting.id, options.endedAt),
  ]);

  // CAS lost: another caller already ended the meeting. Skip side effects so
  // duplicate room_finished deliveries don't double-write audit rows.
  if (!updatedMeeting) return null;

  if (options.deleteLiveKitRoom) {
    try {
      await roomService.deleteRoom(meeting.roomName);
    } catch {
      // Room may already be empty — best-effort.
    }
  }

  if (options.syncCalendar && options.actor?.userId) {
    try {
      await updateCalendarEvent(meeting.id, options.actor.userId);
    } catch {
      // Calendar sync is optional.
    }
  }

  await writeAuditLog({
    actorUserId: options.actor?.userId ?? null,
    actorEmail: options.actor?.email ?? null,
    action: auditActionFor(options.reason),
    resourceType: "meeting",
    resourceId: meeting.id,
    metadata: { reason: options.reason, roomName: meeting.roomName },
    ipAddress: options.audit?.ipAddress ?? null,
    userAgent: options.audit?.userAgent ?? null,
  });

  return updatedMeeting;
}

function auditActionFor(reason: CloseMeetingReason): string {
  switch (reason) {
    case "end_for_all":
      return "meeting.end_for_all";
    case "room_finished":
      return "meeting.room_finished";
    case "monitor_stale":
      return "meeting.monitor_stale";
  }
}

/**
 * End a meeting in response to LiveKit's `room_finished` webhook.
 *
 * In production LiveKit posts webhooks to the API, so this is the fast path that
 * ends a meeting the moment its room is torn down (after empty_timeout). The
 * worker monitor's reconciliation remains the safety net for missed webhooks.
 *
 * Idempotent: returns null when the room maps to no meeting (e.g. the coworking
 * or an aituber room) or the meeting is already ended. The status check + CAS
 * inside `closeMeetingWithSideEffects` guarantees only one delivery of a
 * duplicate webhook runs the side effects.
 */
export async function endMeetingByRoomName(
  roomName: string,
  endedAt: Date
): Promise<Meeting | null> {
  const meeting = await getMeetingByRoomName(roomName);
  if (!meeting || meeting.status === "ended") {
    return null;
  }

  // PR-Bravo #M9: route through the shared side-effects helper so the webhook
  // path produces the same audit log + agent-session cleanup as the manual
  // `/meetings/:id/end` route. The helper internally closes agent sessions
  // (PR-Charlie #H2), so the previous direct `closeActiveMeetingAgentSessions`
  // call is no longer required here.
  return closeMeetingWithSideEffects(meeting, {
    reason: "room_finished",
    endedAt,
    // No actor for the webhook path — LiveKit, not a user, triggered this.
    actor: null,
    // Don't delete the room: LiveKit itself fired room_finished, the room is
    // already torn down. Calling deleteRoom here would 404 and add noise.
    deleteLiveKitRoom: false,
    // No calendar sync from the webhook — without an actor we have no OAuth
    // tokens, and the meeting's owner sync runs from the /end route anyway.
    syncCalendar: false,
  });
}

export interface RoomAiPipelineResult {
  summary: Summary;
  wikiPage: {
    id: string;
    title: string;
  };
  reused: boolean;
}

export async function getExistingRoomAiPipelineResult(
  meetingId: string
): Promise<RoomAiPipelineResult | null> {
  const [summary, wikiPage] = await Promise.all([
    getLatestMeetingSummary(meetingId),
    getRoomAiWikiPageByMeetingId(meetingId),
  ]);

  if (!summary || !wikiPage) {
    return null;
  }

  return {
    summary,
    wikiPage,
    reused: true,
  };
}

export async function createMeetingSummaryWikiArtifacts(
  meeting: Meeting,
  summaryContent: string
): Promise<RoomAiPipelineResult> {
  const meetingNotesPageId = await ensureMeetingNotesPage(
    MEETING_NOTES_PAGE_ID,
    GENERAL_SPACE_ID,
    meeting.creatorId
  );

  const now = new Date();
  const summaryId = crypto.randomUUID();
  const pageId = crypto.randomUUID();
  const pageTitle = `${meeting.title} - AI Summary`;

  const { createdSummary, createdPage } = await createMeetingSummaryArtifactsTx({
    summaryId,
    meetingId: meeting.id,
    summaryContent,
    pageId,
    pageTitle,
    spaceId: GENERAL_SPACE_ID,
    parentPageId: meetingNotesPageId,
    authorId: meeting.creatorId,
    now,
  });

  return {
    summary: createdSummary,
    wikiPage: {
      id: createdPage.id,
      title: createdPage.title,
    },
    reused: false,
  };
}
