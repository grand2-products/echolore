import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import type { Page, Summary } from "../../db/schema.js";
import {
  blocks,
  meetingParticipants,
  meetings,
  pages,
  summaries,
  transcripts,
} from "../../db/schema.js";
import { firstOrNull, getRecordById } from "../../lib/db-utils.js";
import { createPageWithAccessDefaultsTx, type WikiWriteTx } from "../wiki/wiki-repository.js";

export async function listMeetingsByUser(
  userId: string,
  opts?: { limit?: number; offset?: number }
) {
  const query = db
    .select()
    .from(meetings)
    .where(eq(meetings.creatorId, userId))
    .orderBy(desc(meetings.createdAt));
  if (opts?.limit != null) query.limit(opts.limit);
  if (opts?.offset != null) query.offset(opts.offset);
  return query;
}

export async function countMeetingsByUser(userId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(meetings)
    .where(eq(meetings.creatorId, userId));
  return result[0]?.count ?? 0;
}

export async function listAllMeetings(opts?: { limit?: number; offset?: number }) {
  const query = db.select().from(meetings).orderBy(desc(meetings.createdAt));
  if (opts?.limit != null) query.limit(opts.limit);
  if (opts?.offset != null) query.offset(opts.offset);
  return query;
}

export async function countAllMeetings(): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)::int` }).from(meetings);
  return result[0]?.count ?? 0;
}

export async function listMeetingsByStatus(status: string) {
  return db
    .select()
    .from(meetings)
    .where(eq(meetings.status, status))
    .orderBy(desc(meetings.createdAt));
}

export async function getMeetingById(id: string) {
  return getRecordById(meetings, id);
}

export async function getMeetingByRoomName(roomName: string) {
  return firstOrNull(await db.select().from(meetings).where(eq(meetings.roomName, roomName)));
}

export async function getMeetingTranscripts(meetingId: string) {
  return db
    .select()
    .from(transcripts)
    .where(eq(transcripts.meetingId, meetingId))
    .orderBy(transcripts.timestamp);
}

export async function getMeetingSummaries(meetingId: string) {
  return db
    .select()
    .from(summaries)
    .where(eq(summaries.meetingId, meetingId))
    .orderBy(desc(summaries.createdAt));
}

export async function getLatestMeetingSummary(meetingId: string) {
  return firstOrNull(
    await db
      .select()
      .from(summaries)
      .where(eq(summaries.meetingId, meetingId))
      .orderBy(desc(summaries.createdAt))
      .limit(1)
  );
}

export async function getRoomAiWikiPageByMeetingId(meetingId: string) {
  return firstOrNull(
    await db
      .select({ id: pages.id, title: pages.title })
      .from(pages)
      .innerJoin(
        blocks,
        and(
          eq(blocks.pageId, pages.id),
          sql<boolean>`${blocks.properties} ->> 'sourceMeetingId' = ${meetingId}`,
          sql<boolean>`${blocks.properties} ->> 'source' = 'room-ai-mvp'`
        )
      )
      .limit(1)
  );
}

export async function createMeeting(input: {
  id: string;
  title: string;
  creatorId: string;
  roomName: string;
  status: string;
  scheduledAt?: Date | null;
  googleCalendarEventId?: string | null;
  createdAt: Date;
}) {
  return firstOrNull(await db.insert(meetings).values(input).returning());
}

export async function updateMeeting(
  id: string,
  updateData: Partial<Omit<typeof meetings.$inferInsert, "id">>
) {
  return firstOrNull(
    await db.update(meetings).set(updateData).where(eq(meetings.id, id)).returning()
  );
}

export async function deleteMeeting(id: string) {
  return firstOrNull(await db.delete(meetings).where(eq(meetings.id, id)).returning());
}

export async function createTranscript(input: {
  id: string;
  meetingId: string;
  speakerId: string | null;
  content: string;
  timestamp: Date;
  createdAt: Date;
}) {
  return firstOrNull(await db.insert(transcripts).values(input).returning());
}

export async function createSummary(input: {
  id: string;
  meetingId: string;
  content: string;
  createdAt: Date;
}) {
  return firstOrNull(await db.insert(summaries).values(input).returning());
}

/**
 * Ensure the "Meeting Notes" parent page exists.
 * Uses a fixed UUID so concurrent calls converge on the same row.
 */
export async function ensureMeetingNotesPage(
  pageId: string,
  spaceId: string,
  authorId: string
): Promise<string> {
  const [existing] = await db.select({ id: pages.id }).from(pages).where(eq(pages.id, pageId));

  if (existing) return existing.id;

  try {
    const now = new Date();
    await db.insert(pages).values({
      id: pageId,
      title: "Meeting Notes",
      spaceId,
      parentId: null,
      authorId,
      createdAt: now,
      updatedAt: now,
    });
    return pageId;
  } catch {
    // Race condition: another request may have created it concurrently
    const [retry] = await db.select({ id: pages.id }).from(pages).where(eq(pages.id, pageId));
    if (retry) return retry.id;
    throw new Error("Failed to create Meeting Notes page");
  }
}

/**
 * Insert a summary row, a wiki page with access defaults, and heading/text
 * blocks inside a single transaction. Returns the created summary and page.
 */
export async function createMeetingSummaryArtifactsTx(input: {
  summaryId: string;
  meetingId: string;
  summaryContent: string;
  pageId: string;
  pageTitle: string;
  spaceId: string;
  parentPageId: string;
  authorId: string;
  now: Date;
}): Promise<{ createdSummary: Summary; createdPage: Page }> {
  return db.transaction(async (tx: WikiWriteTx) => {
    const [summary] = await tx
      .insert(summaries)
      .values({
        id: input.summaryId,
        meetingId: input.meetingId,
        content: input.summaryContent,
        createdAt: input.now,
      })
      .returning();

    if (!summary) {
      throw new Error("Failed to create summary");
    }

    const page = await createPageWithAccessDefaultsTx(tx, {
      id: input.pageId,
      title: input.pageTitle,
      spaceId: input.spaceId,
      parentId: input.parentPageId,
      authorId: input.authorId,
      createdAt: input.now,
      updatedAt: input.now,
    });

    await tx.insert(blocks).values([
      {
        id: crypto.randomUUID(),
        pageId: input.pageId,
        type: "heading1",
        content: input.pageTitle,
        properties: null,
        sortOrder: 0,
        createdAt: input.now,
        updatedAt: input.now,
      },
      {
        id: crypto.randomUUID(),
        pageId: input.pageId,
        type: "text",
        content: input.summaryContent,
        properties: { sourceMeetingId: input.meetingId, source: "room-ai-mvp" },
        sortOrder: 1,
        createdAt: input.now,
        updatedAt: input.now,
      },
    ]);

    return { createdSummary: summary, createdPage: page };
  });
}

// --- Meeting Participants ---

export async function recordParticipantJoin(input: {
  id: string;
  meetingId: string;
  userId: string | null;
  guestIdentity: string | null;
  displayName: string;
  role: string;
  joinedAt: Date;
}) {
  // Upsert: if participant already has an active session (no leftAt), skip insert
  const existing = await db
    .select({ id: meetingParticipants.id })
    .from(meetingParticipants)
    .where(
      and(
        eq(meetingParticipants.meetingId, input.meetingId),
        input.userId
          ? eq(meetingParticipants.userId, input.userId)
          : eq(meetingParticipants.guestIdentity, input.guestIdentity ?? ""),
        isNull(meetingParticipants.leftAt)
      )
    )
    .limit(1);

  if (existing.length > 0) return null; // Already has active session

  return firstOrNull(await db.insert(meetingParticipants).values(input).returning());
}

export async function recordParticipantLeave(
  meetingId: string,
  participantIdentity: string,
  leftAt: Date
) {
  // Try userId first, then guestIdentity
  const result = await db
    .update(meetingParticipants)
    .set({ leftAt })
    .where(
      and(
        eq(meetingParticipants.meetingId, meetingId),
        isNull(meetingParticipants.leftAt),
        sql`(${meetingParticipants.userId} = ${participantIdentity} OR ${meetingParticipants.guestIdentity} = ${participantIdentity})`
      )
    )
    .returning();

  return result[0] ?? null;
}

export async function getActiveParticipantCounts(
  meetingIds: string[]
): Promise<Map<string, number>> {
  if (meetingIds.length === 0) return new Map();

  const rows = await db
    .select({
      meetingId: meetingParticipants.meetingId,
      count: sql<number>`count(*)::int`,
    })
    .from(meetingParticipants)
    .where(
      and(inArray(meetingParticipants.meetingId, meetingIds), isNull(meetingParticipants.leftAt))
    )
    .groupBy(meetingParticipants.meetingId);

  return new Map(rows.map((r) => [r.meetingId, r.count]));
}

export async function listMeetingParticipants(meetingId: string) {
  return db
    .select()
    .from(meetingParticipants)
    .where(eq(meetingParticipants.meetingId, meetingId))
    .orderBy(meetingParticipants.joinedAt);
}

export async function closeAllParticipantSessions(meetingId: string, leftAt: Date) {
  return db
    .update(meetingParticipants)
    .set({ leftAt })
    .where(and(eq(meetingParticipants.meetingId, meetingId), isNull(meetingParticipants.leftAt)));
}

export async function getMeetingRoomName(meetingId: string) {
  const [meeting] = await db
    .select({ roomName: meetings.roomName })
    .from(meetings)
    .where(eq(meetings.id, meetingId));
  return meeting?.roomName ?? null;
}
