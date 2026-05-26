import type { Meeting, Summary } from "../../db/schema.js";
import {
  closeAllParticipantSessions,
  createMeetingSummaryArtifactsTx,
  ensureMeetingNotesPage,
  getLatestMeetingSummary,
  getMeetingByRoomName,
  getRoomAiWikiPageByMeetingId,
  updateMeeting,
} from "../../repositories/meeting/meeting-repository.js";
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
 * End a meeting in response to LiveKit's `room_finished` webhook.
 *
 * In production LiveKit posts webhooks to the API, so this is the fast path that
 * ends a meeting the moment its room is torn down (after empty_timeout). The
 * worker monitor's reconciliation remains the safety net for missed webhooks.
 *
 * Idempotent: returns null when the room maps to no meeting (e.g. the coworking
 * or an aituber room) or the meeting is already ended.
 */
export async function endMeetingByRoomName(
  roomName: string,
  endedAt: Date
): Promise<Meeting | null> {
  const meeting = await getMeetingByRoomName(roomName);
  if (!meeting || meeting.status === "ended") {
    return null;
  }

  const [updated] = await Promise.all([
    updateMeeting(meeting.id, { status: "ended", endedAt }),
    closeAllParticipantSessions(meeting.id, endedAt),
  ]);

  return updated;
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
