import { db } from "../../db/index.js";
import { type Meeting, type Summary, blocks, summaries } from "../../db/schema.js";
import {
  getLatestMeetingSummary,
  getRoomAiWikiPageByMeetingId,
} from "../../repositories/meeting/meeting-repository.js";
import { createPageWithAccessDefaultsTx } from "../wiki/wiki-service.js";
import { GENERAL_SPACE_ID } from "../wiki/space-service.js";

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
        parentId: null,
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
