import { sql } from "kysely";
import { type DbTransaction, db } from "../../db/index.js";
import type { NewMeeting, Page, Summary } from "../../db/schema.js";
import { firstOrNull } from "../../lib/db-utils.js";
import { createPageWithAccessDefaultsTx } from "../wiki/wiki-repository.js";

export async function listMeetingsByUser(
  userId: string,
  opts?: { limit?: number; offset?: number }
) {
  let query = db
    .selectFrom("meetings")
    .selectAll()
    .where("creatorId", "=", userId)
    .orderBy("createdAt", "desc");
  if (opts?.limit != null) query = query.limit(opts.limit);
  if (opts?.offset != null) query = query.offset(opts.offset);
  return query.execute();
}

export async function countMeetingsByUser(userId: string): Promise<number> {
  const result = await db
    .selectFrom("meetings")
    .select(sql<number>`count(*)::int`.as("count"))
    .where("creatorId", "=", userId)
    .executeTakeFirst();
  return result?.count ?? 0;
}

export async function listAllMeetings(opts?: { limit?: number; offset?: number }) {
  let query = db.selectFrom("meetings").selectAll().orderBy("createdAt", "desc");
  if (opts?.limit != null) query = query.limit(opts.limit);
  if (opts?.offset != null) query = query.offset(opts.offset);
  return query.execute();
}

export async function countAllMeetings(): Promise<number> {
  const result = await db
    .selectFrom("meetings")
    .select(sql<number>`count(*)::int`.as("count"))
    .executeTakeFirst();
  return result?.count ?? 0;
}

export async function listMeetingsByStatus(status: string) {
  return db
    .selectFrom("meetings")
    .selectAll()
    .where("status", "=", status)
    .orderBy("createdAt", "desc")
    .execute();
}

export async function getMeetingById(id: string) {
  return (
    (await db.selectFrom("meetings").selectAll().where("id", "=", id).executeTakeFirst()) ?? null
  );
}

export async function getMeetingByRoomName(roomName: string) {
  return firstOrNull(
    await db.selectFrom("meetings").selectAll().where("roomName", "=", roomName).execute()
  );
}

export async function getMeetingTranscripts(meetingId: string) {
  return db
    .selectFrom("transcripts")
    .selectAll()
    .where("meetingId", "=", meetingId)
    .orderBy("timestamp")
    .execute();
}

export async function getMeetingSummaries(meetingId: string) {
  return db
    .selectFrom("summaries")
    .selectAll()
    .where("meetingId", "=", meetingId)
    .orderBy("createdAt", "desc")
    .execute();
}

export async function getLatestMeetingSummary(meetingId: string) {
  return firstOrNull(
    await db
      .selectFrom("summaries")
      .selectAll()
      .where("meetingId", "=", meetingId)
      .orderBy("createdAt", "desc")
      .limit(1)
      .execute()
  );
}

export async function getRoomAiWikiPageByMeetingId(meetingId: string) {
  return firstOrNull(
    await db
      .selectFrom("pages")
      .innerJoin("blocks", (join) =>
        join
          .onRef("blocks.pageId", "=", "pages.id")
          .on(sql`${sql.ref("blocks.properties")} ->> 'sourceMeetingId'`, "=", meetingId)
          .on(sql`${sql.ref("blocks.properties")} ->> 'source'`, "=", "room-ai-mvp")
      )
      .select(["pages.id", "pages.title"])
      .limit(1)
      .execute()
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
  return firstOrNull(
    await db
      .insertInto("meetings")
      .values({
        id: input.id,
        title: input.title,
        creatorId: input.creatorId,
        roomName: input.roomName,
        status: input.status,
        scheduledAt: input.scheduledAt ?? null,
        googleCalendarEventId: input.googleCalendarEventId ?? null,
        createdAt: input.createdAt,
      })
      .returningAll()
      .execute()
  );
}

export async function updateMeeting(id: string, updateData: Partial<Omit<NewMeeting, "id">>) {
  return firstOrNull(
    await db.updateTable("meetings").set(updateData).where("id", "=", id).returningAll().execute()
  );
}

export async function deleteMeeting(id: string) {
  return firstOrNull(await db.deleteFrom("meetings").where("id", "=", id).returningAll().execute());
}

export async function createTranscript(input: {
  id: string;
  meetingId: string;
  speakerId: string | null;
  content: string;
  timestamp: Date;
  createdAt: Date;
}) {
  return firstOrNull(
    await db
      .insertInto("transcripts")
      .values({
        id: input.id,
        meetingId: input.meetingId,
        speakerId: input.speakerId,
        content: input.content,
        timestamp: input.timestamp,
        createdAt: input.createdAt,
      })
      .returningAll()
      .execute()
  );
}

export async function createSummary(input: {
  id: string;
  meetingId: string;
  content: string;
  createdAt: Date;
}) {
  return firstOrNull(
    await db
      .insertInto("summaries")
      .values({
        id: input.id,
        meetingId: input.meetingId,
        content: input.content,
        createdAt: input.createdAt,
      })
      .returningAll()
      .execute()
  );
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
  const existing = await db
    .selectFrom("pages")
    .select("id")
    .where("id", "=", pageId)
    .executeTakeFirst();

  if (existing) return existing.id;

  try {
    const now = new Date();
    await db
      .insertInto("pages")
      .values({
        id: pageId,
        title: "Meeting Notes",
        spaceId: spaceId,
        parentId: null,
        authorId: authorId,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return pageId;
  } catch {
    // Race condition: another request may have created it concurrently
    const retry = await db
      .selectFrom("pages")
      .select("id")
      .where("id", "=", pageId)
      .executeTakeFirst();
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
  return db.transaction().execute(async (trx: DbTransaction) => {
    const summary = await trx
      .insertInto("summaries")
      .values({
        id: input.summaryId,
        meetingId: input.meetingId,
        content: input.summaryContent,
        createdAt: input.now,
      })
      .returningAll()
      .executeTakeFirst();

    if (!summary) {
      throw new Error("Failed to create summary");
    }

    const page = await createPageWithAccessDefaultsTx(trx, {
      id: input.pageId,
      title: input.pageTitle,
      spaceId: input.spaceId,
      parentId: input.parentPageId,
      authorId: input.authorId,
      createdAt: input.now,
      updatedAt: input.now,
    });

    await trx
      .insertInto("blocks")
      .values([
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
          properties: {
            sourceMeetingId: input.meetingId,
            source: "room-ai-mvp",
          },
          sortOrder: 1,
          createdAt: input.now,
          updatedAt: input.now,
        },
      ])
      .execute();

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
  let query = db
    .selectFrom("meeting_participants")
    .select("id")
    .where("meetingId", "=", input.meetingId)
    .where("leftAt", "is", null)
    .limit(1);

  if (input.userId) {
    query = query.where("userId", "=", input.userId);
  } else {
    query = query.where("guestIdentity", "=", input.guestIdentity ?? "");
  }

  const existing = await query.execute();
  if (existing.length > 0) return null; // Already has active session

  return firstOrNull(
    await db
      .insertInto("meeting_participants")
      .values({
        id: input.id,
        meetingId: input.meetingId,
        userId: input.userId,
        guestIdentity: input.guestIdentity,
        displayName: input.displayName,
        role: input.role,
        joinedAt: input.joinedAt,
      })
      .returningAll()
      .execute()
  );
}

export async function recordParticipantLeave(
  meetingId: string,
  participantIdentity: string,
  leftAt: Date
) {
  const result = await db
    .updateTable("meeting_participants")
    .set({ leftAt: leftAt })
    .where("meetingId", "=", meetingId)
    .where("leftAt", "is", null)
    .where((eb) =>
      eb.or([eb("userId", "=", participantIdentity), eb("guestIdentity", "=", participantIdentity)])
    )
    .returningAll()
    .execute();

  return result[0] ?? null;
}

export async function getActiveParticipantCounts(
  meetingIds: string[]
): Promise<Map<string, number>> {
  if (meetingIds.length === 0) return new Map();

  const rows = await db
    .selectFrom("meeting_participants")
    .select(["meetingId", sql<number>`count(*)::int`.as("count")])
    .where("meetingId", "in", meetingIds)
    .where("leftAt", "is", null)
    .groupBy("meetingId")
    .execute();

  return new Map(rows.map((r) => [r.meetingId, r.count]));
}

export async function listMeetingParticipants(meetingId: string) {
  return db
    .selectFrom("meeting_participants")
    .selectAll()
    .where("meetingId", "=", meetingId)
    .orderBy("joinedAt")
    .execute();
}

export async function closeAllParticipantSessions(meetingId: string, leftAt: Date) {
  return db
    .updateTable("meeting_participants")
    .set({ leftAt: leftAt })
    .where("meetingId", "=", meetingId)
    .where("leftAt", "is", null)
    .execute();
}

export async function getMeetingRoomName(meetingId: string) {
  const meeting = await db
    .selectFrom("meetings")
    .select("roomName")
    .where("id", "=", meetingId)
    .executeTakeFirst();
  return meeting?.roomName ?? null;
}
