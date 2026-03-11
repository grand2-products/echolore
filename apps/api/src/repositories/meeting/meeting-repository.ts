import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { blocks, meetings, pages, summaries, transcripts } from "../../db/schema.js";

export async function listMeetingsByUser(userId: string) {
  return db
    .select()
    .from(meetings)
    .where(eq(meetings.creatorId, userId))
    .orderBy(desc(meetings.createdAt));
}

export async function listAllMeetings() {
  return db.select().from(meetings).orderBy(desc(meetings.createdAt));
}

export async function listMeetingsByStatus(status: string) {
  return db
    .select()
    .from(meetings)
    .where(eq(meetings.status, status))
    .orderBy(desc(meetings.createdAt));
}

export async function getMeetingById(id: string) {
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, id));
  return meeting ?? null;
}

export async function getMeetingByRoomName(roomName: string) {
  const [meeting] = await db.select().from(meetings).where(eq(meetings.roomName, roomName));
  return meeting ?? null;
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
  const [summary] = await db
    .select()
    .from(summaries)
    .where(eq(summaries.meetingId, meetingId))
    .orderBy(desc(summaries.createdAt))
    .limit(1);
  return summary ?? null;
}

export async function getRoomAiWikiPageByMeetingId(meetingId: string) {
  const [page] = await db
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
    .limit(1);

  return page ?? null;
}

export async function createMeeting(input: {
  id: string;
  title: string;
  creatorId: string;
  roomName: string;
  status: string;
  createdAt: Date;
}) {
  const [meeting] = await db.insert(meetings).values(input).returning();
  return meeting ?? null;
}

export async function updateMeeting(id: string, updateData: Record<string, unknown>) {
  const [meeting] = await db
    .update(meetings)
    .set(updateData)
    .where(eq(meetings.id, id))
    .returning();
  return meeting ?? null;
}

export async function deleteMeeting(id: string) {
  const [meeting] = await db.delete(meetings).where(eq(meetings.id, id)).returning();
  return meeting ?? null;
}

export async function createTranscript(input: {
  id: string;
  meetingId: string;
  speakerId: string | null;
  content: string;
  timestamp: Date;
  createdAt: Date;
}) {
  const [transcript] = await db.insert(transcripts).values(input).returning();
  return transcript ?? null;
}

export async function createSummary(input: {
  id: string;
  meetingId: string;
  content: string;
  createdAt: Date;
}) {
  const [summary] = await db.insert(summaries).values(input).returning();
  return summary ?? null;
}
