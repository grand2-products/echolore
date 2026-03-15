import type { Meeting, Summary } from "../../db/schema.js";
import {
  createMeetingSummaryArtifactsTx,
  ensureMeetingNotesPage,
  getLatestMeetingSummary,
  getRoomAiWikiPageByMeetingId,
} from "../../repositories/meeting/meeting-repository.js";
import { GENERAL_SPACE_ID } from "../wiki/space-service.js";

/** Fixed ID for the "Meeting Notes" parent page in General Space. */
export const MEETING_NOTES_PAGE_ID = "00000000-0000-0000-0000-000000000002";

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
