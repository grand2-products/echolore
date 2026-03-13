import { db } from "../../db/index.js";
import { type Meeting, type Summary, blocks, pages, summaries } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import {
  getLatestMeetingSummary,
  getRoomAiWikiPageByMeetingId,
} from "../../repositories/meeting/meeting-repository.js";
import { createPageWithAccessDefaultsTx } from "../wiki/wiki-service.js";
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

/**
 * Ensure the "Meeting Notes" parent page exists in General Space.
 * Uses a fixed UUID so concurrent calls converge on the same page.
 */
async function ensureMeetingNotesPage(authorId: string): Promise<string> {
  const [existing] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(eq(pages.id, MEETING_NOTES_PAGE_ID));

  if (existing) return existing.id;

  try {
    const now = new Date();
    await db.insert(pages).values({
      id: MEETING_NOTES_PAGE_ID,
      title: "Meeting Notes",
      spaceId: GENERAL_SPACE_ID,
      parentId: null,
      authorId,
      createdAt: now,
      updatedAt: now,
    });
    return MEETING_NOTES_PAGE_ID;
  } catch {
    // Race condition: another request may have created it concurrently
    const [retry] = await db
      .select({ id: pages.id })
      .from(pages)
      .where(eq(pages.id, MEETING_NOTES_PAGE_ID));
    if (retry) return retry.id;
    throw new Error("Failed to create Meeting Notes page");
  }
}

export async function createMeetingSummaryWikiArtifacts(
  meeting: Meeting,
  summaryContent: string
): Promise<RoomAiPipelineResult> {
  const meetingNotesPageId = await ensureMeetingNotesPage(meeting.creatorId);

  const now = new Date();
  const summaryId = crypto.randomUUID();
  const pageId = crypto.randomUUID();
  const pageTitle = `${meeting.title} - AI Summary`;

  const { createdSummary, createdPage } = await db.transaction(async (tx) => {
    const [summary] = await tx
      .insert(summaries)
      .values({
        id: summaryId,
        meetingId: meeting.id,
        content: summaryContent,
        createdAt: now,
      })
      .returning();

    if (!summary) {
      throw new Error("Failed to create summary");
    }

    const page = await createPageWithAccessDefaultsTx(tx, {
      id: pageId,
      title: pageTitle,
      spaceId: GENERAL_SPACE_ID,
      parentId: meetingNotesPageId,
      authorId: meeting.creatorId,
      createdAt: now,
      updatedAt: now,
    });

    await tx.insert(blocks).values([
      {
        id: crypto.randomUUID(),
        pageId,
        type: "heading1",
        content: pageTitle,
        properties: null,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        pageId,
        type: "text",
        content: summaryContent,
        properties: { sourceMeetingId: meeting.id, source: "room-ai-mvp" },
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    return { createdSummary: summary, createdPage: page };
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
