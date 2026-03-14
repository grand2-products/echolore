import { and, asc, desc, eq, gte, ne } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  agents,
  meetingAgentEvents,
  meetingAgentSessions,
  meetingTranscriptSegments,
} from "../../db/schema.js";

export async function listTranscriptSegmentsByMeeting(meetingId: string) {
  return db
    .select()
    .from(meetingTranscriptSegments)
    .where(eq(meetingTranscriptSegments.meetingId, meetingId))
    .orderBy(asc(meetingTranscriptSegments.startedAt), asc(meetingTranscriptSegments.createdAt));
}

export async function listFinalTranscriptSegmentsByMeeting(meetingId: string, limit = 50) {
  return db
    .select()
    .from(meetingTranscriptSegments)
    .where(
      and(
        eq(meetingTranscriptSegments.meetingId, meetingId),
        eq(meetingTranscriptSegments.isPartial, false)
      )
    )
    .orderBy(desc(meetingTranscriptSegments.startedAt), desc(meetingTranscriptSegments.createdAt))
    .limit(limit);
}

export async function getTranscriptSegmentByKey(meetingId: string, segmentKey: string) {
  const [segment] = await db
    .select()
    .from(meetingTranscriptSegments)
    .where(
      and(
        eq(meetingTranscriptSegments.meetingId, meetingId),
        eq(meetingTranscriptSegments.segmentKey, segmentKey)
      )
    )
    .orderBy(desc(meetingTranscriptSegments.createdAt))
    .limit(1);

  return segment ?? null;
}

export async function createTranscriptSegment(
  input: typeof meetingTranscriptSegments.$inferInsert
) {
  const [segment] = await db.insert(meetingTranscriptSegments).values(input).returning();
  return segment ?? null;
}

export async function updateTranscriptSegment(
  id: string,
  input: Partial<typeof meetingTranscriptSegments.$inferInsert>
) {
  const [segment] = await db
    .update(meetingTranscriptSegments)
    .set(input)
    .where(eq(meetingTranscriptSegments.id, id))
    .returning();
  return segment ?? null;
}

export async function listActiveAgents() {
  return db.select().from(agents).where(eq(agents.isActive, true)).orderBy(asc(agents.name));
}

export async function getAgentById(id: string) {
  const [agent] = await db.select().from(agents).where(eq(agents.id, id));
  return agent ?? null;
}

export async function createAgent(input: typeof agents.$inferInsert) {
  const [agent] = await db.insert(agents).values(input).returning();
  return agent ?? null;
}

export async function updateAgent(id: string, input: Partial<typeof agents.$inferInsert>) {
  const [agent] = await db.update(agents).set(input).where(eq(agents.id, id)).returning();
  return agent ?? null;
}

export async function createMeetingAgentSession(input: typeof meetingAgentSessions.$inferInsert) {
  const [session] = await db.insert(meetingAgentSessions).values(input).returning();
  return session ?? null;
}

export async function getActiveMeetingAgentSession(meetingId: string, agentId: string) {
  const [session] = await db
    .select()
    .from(meetingAgentSessions)
    .where(
      and(
        eq(meetingAgentSessions.meetingId, meetingId),
        eq(meetingAgentSessions.agentId, agentId),
        eq(meetingAgentSessions.state, "active")
      )
    )
    .orderBy(desc(meetingAgentSessions.createdAt))
    .limit(1);

  return session ?? null;
}

export async function listActiveMeetingAgentSessions(meetingId: string) {
  return db
    .select()
    .from(meetingAgentSessions)
    .where(
      and(eq(meetingAgentSessions.meetingId, meetingId), eq(meetingAgentSessions.state, "active"))
    )
    .orderBy(desc(meetingAgentSessions.createdAt));
}

export async function updateMeetingAgentSession(
  id: string,
  input: Partial<typeof meetingAgentSessions.$inferInsert>
) {
  const [session] = await db
    .update(meetingAgentSessions)
    .set(input)
    .where(eq(meetingAgentSessions.id, id))
    .returning();
  return session ?? null;
}

export async function listMeetingAgentEvents(meetingId: string) {
  return db
    .select()
    .from(meetingAgentEvents)
    .where(eq(meetingAgentEvents.meetingId, meetingId))
    .orderBy(asc(meetingAgentEvents.createdAt));
}

export async function createMeetingAgentEvent(input: typeof meetingAgentEvents.$inferInsert) {
  const [event] = await db.insert(meetingAgentEvents).values(input).returning();
  return event ?? null;
}

export async function listFinalSegmentsAfter(
  meetingId: string,
  afterSegmentId: string | null,
  limit = 50
) {
  const conditions = [
    eq(meetingTranscriptSegments.meetingId, meetingId),
    eq(meetingTranscriptSegments.isPartial, false),
  ];

  if (afterSegmentId) {
    // Get the createdAt of the cursor segment, then fetch segments at or after it
    // (excluding the cursor itself to handle same-timestamp rows)
    const [cursor] = await db
      .select({ createdAt: meetingTranscriptSegments.createdAt })
      .from(meetingTranscriptSegments)
      .where(eq(meetingTranscriptSegments.id, afterSegmentId))
      .limit(1);

    if (cursor) {
      conditions.push(gte(meetingTranscriptSegments.createdAt, cursor.createdAt));
      conditions.push(ne(meetingTranscriptSegments.id, afterSegmentId));
    }
  }

  return db
    .select()
    .from(meetingTranscriptSegments)
    .where(and(...conditions))
    .orderBy(asc(meetingTranscriptSegments.createdAt))
    .limit(limit);
}

export async function listAutonomousActiveSessions() {
  return db
    .select({
      session: meetingAgentSessions,
      agent: agents,
    })
    .from(meetingAgentSessions)
    .innerJoin(agents, eq(meetingAgentSessions.agentId, agents.id))
    .where(
      and(
        eq(meetingAgentSessions.state, "active"),
        eq(agents.autonomousEnabled, true),
        eq(agents.isActive, true)
      )
    );
}

export async function updateSessionEvalCursor(sessionId: string, segmentId: string) {
  const [session] = await db
    .update(meetingAgentSessions)
    .set({ lastAutoEvalSegmentId: segmentId })
    .where(eq(meetingAgentSessions.id, sessionId))
    .returning();
  return session ?? null;
}

export async function getLastAutonomousEventTime(
  meetingId: string,
  agentId: string
): Promise<Date | null> {
  const [event] = await db
    .select({ createdAt: meetingAgentEvents.createdAt })
    .from(meetingAgentEvents)
    .where(
      and(
        eq(meetingAgentEvents.meetingId, meetingId),
        eq(meetingAgentEvents.agentId, agentId),
        eq(meetingAgentEvents.eventType, "response.autonomous")
      )
    )
    .orderBy(desc(meetingAgentEvents.createdAt))
    .limit(1);

  return event?.createdAt ?? null;
}
