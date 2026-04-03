import { db } from "../../db/index.js";
import type {
  Agent,
  MeetingAgentEvent,
  MeetingAgentSession,
  MeetingTranscriptSegment,
  NewAgent,
  NewMeetingAgentEvent,
  NewMeetingAgentSession,
  NewMeetingTranscriptSegment,
} from "../../db/schema.js";

export async function listTranscriptSegmentsByMeeting(
  meetingId: string
): Promise<MeetingTranscriptSegment[]> {
  return db
    .selectFrom("meeting_transcript_segments")
    .selectAll()
    .where("meetingId", "=", meetingId)
    .orderBy("startedAt", "asc")
    .orderBy("createdAt", "asc")
    .execute();
}

export async function listFinalTranscriptSegmentsByMeeting(
  meetingId: string,
  limit = 50
): Promise<MeetingTranscriptSegment[]> {
  return db
    .selectFrom("meeting_transcript_segments")
    .selectAll()
    .where("meetingId", "=", meetingId)
    .where("isPartial", "=", false)
    .orderBy("startedAt", "desc")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .execute();
}

export async function getTranscriptSegmentByKey(
  meetingId: string,
  segmentKey: string
): Promise<MeetingTranscriptSegment | null> {
  return (
    (await db
      .selectFrom("meeting_transcript_segments")
      .selectAll()
      .where("meetingId", "=", meetingId)
      .where("segmentKey", "=", segmentKey)
      .orderBy("createdAt", "desc")
      .limit(1)
      .executeTakeFirst()) ?? null
  );
}

export async function createTranscriptSegment(
  input: NewMeetingTranscriptSegment
): Promise<MeetingTranscriptSegment | null> {
  return (
    (await db
      .insertInto("meeting_transcript_segments")
      .values(input)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function updateTranscriptSegment(
  id: string,
  input: Partial<NewMeetingTranscriptSegment>
): Promise<MeetingTranscriptSegment | null> {
  return (
    (await db
      .updateTable("meeting_transcript_segments")
      .set(input)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function listActiveAgents(): Promise<Agent[]> {
  return db
    .selectFrom("agents")
    .selectAll()
    .where("isActive", "=", true)
    .orderBy("name", "asc")
    .execute();
}

export async function getAgentById(id: string): Promise<Agent | null> {
  return (
    (await db.selectFrom("agents").selectAll().where("id", "=", id).executeTakeFirst()) ?? null
  );
}

export async function createAgent(input: NewAgent): Promise<Agent | null> {
  return (await db.insertInto("agents").values(input).returningAll().executeTakeFirst()) ?? null;
}

export async function updateAgent(id: string, input: Partial<NewAgent>): Promise<Agent | null> {
  return (
    (await db
      .updateTable("agents")
      .set(input)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function createMeetingAgentSession(
  input: NewMeetingAgentSession
): Promise<MeetingAgentSession | null> {
  return (
    (await db
      .insertInto("meeting_agent_sessions")
      .values(input)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function getActiveMeetingAgentSession(
  meetingId: string,
  agentId: string
): Promise<MeetingAgentSession | null> {
  return (
    (await db
      .selectFrom("meeting_agent_sessions")
      .selectAll()
      .where("meetingId", "=", meetingId)
      .where("agentId", "=", agentId)
      .where("state", "=", "active")
      .orderBy("createdAt", "desc")
      .limit(1)
      .executeTakeFirst()) ?? null
  );
}

export async function listActiveMeetingAgentSessions(
  meetingId: string
): Promise<MeetingAgentSession[]> {
  return db
    .selectFrom("meeting_agent_sessions")
    .selectAll()
    .where("meetingId", "=", meetingId)
    .where("state", "=", "active")
    .orderBy("createdAt", "desc")
    .execute();
}

export async function updateMeetingAgentSession(
  id: string,
  input: Partial<NewMeetingAgentSession>
): Promise<MeetingAgentSession | null> {
  return (
    (await db
      .updateTable("meeting_agent_sessions")
      .set(input)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function listMeetingAgentEvents(meetingId: string): Promise<MeetingAgentEvent[]> {
  return db
    .selectFrom("meeting_agent_events")
    .selectAll()
    .where("meetingId", "=", meetingId)
    .orderBy("createdAt", "asc")
    .execute();
}

export async function createMeetingAgentEvent(
  input: NewMeetingAgentEvent
): Promise<MeetingAgentEvent | null> {
  return (
    (await db
      .insertInto("meeting_agent_events")
      .values({
        ...input,
        payload: input.payload,
      })
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function listFinalSegmentsAfter(
  meetingId: string,
  afterSegmentId: string | null,
  limit = 50
): Promise<MeetingTranscriptSegment[]> {
  let query = db
    .selectFrom("meeting_transcript_segments")
    .selectAll()
    .where("meetingId", "=", meetingId)
    .where("isPartial", "=", false);

  if (afterSegmentId) {
    const cursor = await db
      .selectFrom("meeting_transcript_segments")
      .select("createdAt")
      .where("id", "=", afterSegmentId)
      .limit(1)
      .executeTakeFirst();

    if (cursor) {
      query = query.where("createdAt", ">=", cursor.createdAt).where("id", "!=", afterSegmentId);
    }
  }

  return query.orderBy("createdAt", "asc").limit(limit).execute();
}

export async function listAutonomousActiveSessions(): Promise<
  Array<{ session: MeetingAgentSession; agent: Agent }>
> {
  const rows = await db
    .selectFrom("meeting_agent_sessions")
    .innerJoin("agents", "meeting_agent_sessions.agentId", "agents.id")
    .select([
      "meeting_agent_sessions.id as sessionId",
      "meeting_agent_sessions.meetingId",
      "meeting_agent_sessions.agentId",
      "meeting_agent_sessions.state",
      "meeting_agent_sessions.invokedByUserId",
      "meeting_agent_sessions.lastAutoEvalSegmentId",
      "meeting_agent_sessions.joinedAt as sessionJoinedAt",
      "meeting_agent_sessions.leftAt as sessionLeftAt",
      "meeting_agent_sessions.createdAt as sessionCreatedAt",
      "agents.id as agentTableId",
      "agents.name",
      "agents.description",
      "agents.systemPrompt",
      "agents.voiceProfile",
      "agents.interventionStyle",
      "agents.defaultProvider",
      "agents.llmConfigSetId",
      "agents.isActive",
      "agents.autonomousEnabled",
      "agents.autonomousCooldownSec",
      "agents.createdBy",
      "agents.createdAt as agentCreatedAt",
      "agents.updatedAt as agentUpdatedAt",
    ])
    .where("meeting_agent_sessions.state", "=", "active")
    .where("agents.autonomousEnabled", "=", true)
    .where("agents.isActive", "=", true)
    .execute();

  return rows.map((r) => ({
    session: {
      id: r.sessionId,
      meetingId: r.meetingId,
      agentId: r.agentId,
      state: r.state,
      invokedByUserId: r.invokedByUserId,
      lastAutoEvalSegmentId: r.lastAutoEvalSegmentId,
      joinedAt: r.sessionJoinedAt,
      leftAt: r.sessionLeftAt,
      createdAt: r.sessionCreatedAt,
    },
    agent: {
      id: r.agentTableId,
      name: r.name,
      description: r.description,
      systemPrompt: r.systemPrompt,
      voiceProfile: r.voiceProfile,
      interventionStyle: r.interventionStyle,
      defaultProvider: r.defaultProvider,
      llmConfigSetId: r.llmConfigSetId,
      isActive: r.isActive,
      autonomousEnabled: r.autonomousEnabled,
      autonomousCooldownSec: r.autonomousCooldownSec,
      createdBy: r.createdBy,
      createdAt: r.agentCreatedAt,
      updatedAt: r.agentUpdatedAt,
    },
  }));
}

export async function updateSessionEvalCursor(
  sessionId: string,
  segmentId: string
): Promise<MeetingAgentSession | null> {
  return (
    (await db
      .updateTable("meeting_agent_sessions")
      .set({ lastAutoEvalSegmentId: segmentId })
      .where("id", "=", sessionId)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function getLastAutonomousEventTime(
  meetingId: string,
  agentId: string
): Promise<Date | null> {
  const event = await db
    .selectFrom("meeting_agent_events")
    .select("createdAt")
    .where("meetingId", "=", meetingId)
    .where("agentId", "=", agentId)
    .where("eventType", "=", "response.autonomous")
    .orderBy("createdAt", "desc")
    .limit(1)
    .executeTakeFirst();

  return event?.createdAt ?? null;
}
