import { db } from "../../db/index.js";
import type {
  NewAgent,
  NewMeetingAgentEvent,
  NewMeetingAgentSession,
  NewMeetingTranscriptSegment,
} from "../../db/schema.js";

export async function listTranscriptSegmentsByMeeting(meetingId: string) {
  return db
    .selectFrom("meeting_transcript_segments")
    .selectAll()
    .where("meeting_id", "=", meetingId)
    .orderBy("started_at", "asc")
    .orderBy("created_at", "asc")
    .execute();
}

export async function listFinalTranscriptSegmentsByMeeting(meetingId: string, limit = 50) {
  return db
    .selectFrom("meeting_transcript_segments")
    .selectAll()
    .where("meeting_id", "=", meetingId)
    .where("is_partial", "=", false)
    .orderBy("started_at", "desc")
    .orderBy("created_at", "desc")
    .limit(limit)
    .execute();
}

export async function getTranscriptSegmentByKey(meetingId: string, segmentKey: string) {
  return (
    (await db
      .selectFrom("meeting_transcript_segments")
      .selectAll()
      .where("meeting_id", "=", meetingId)
      .where("segment_key", "=", segmentKey)
      .orderBy("created_at", "desc")
      .limit(1)
      .executeTakeFirst()) ?? null
  );
}

export async function createTranscriptSegment(input: NewMeetingTranscriptSegment) {
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
) {
  return (
    (await db
      .updateTable("meeting_transcript_segments")
      .set(input)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function listActiveAgents() {
  return db
    .selectFrom("agents")
    .selectAll()
    .where("is_active", "=", true)
    .orderBy("name", "asc")
    .execute();
}

export async function getAgentById(id: string) {
  return (
    (await db.selectFrom("agents").selectAll().where("id", "=", id).executeTakeFirst()) ?? null
  );
}

export async function createAgent(input: NewAgent) {
  return (await db.insertInto("agents").values(input).returningAll().executeTakeFirst()) ?? null;
}

export async function updateAgent(id: string, input: Partial<NewAgent>) {
  return (
    (await db
      .updateTable("agents")
      .set(input)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function createMeetingAgentSession(input: NewMeetingAgentSession) {
  return (
    (await db
      .insertInto("meeting_agent_sessions")
      .values(input)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function getActiveMeetingAgentSession(meetingId: string, agentId: string) {
  return (
    (await db
      .selectFrom("meeting_agent_sessions")
      .selectAll()
      .where("meeting_id", "=", meetingId)
      .where("agent_id", "=", agentId)
      .where("state", "=", "active")
      .orderBy("created_at", "desc")
      .limit(1)
      .executeTakeFirst()) ?? null
  );
}

export async function listActiveMeetingAgentSessions(meetingId: string) {
  return db
    .selectFrom("meeting_agent_sessions")
    .selectAll()
    .where("meeting_id", "=", meetingId)
    .where("state", "=", "active")
    .orderBy("created_at", "desc")
    .execute();
}

export async function updateMeetingAgentSession(
  id: string,
  input: Partial<NewMeetingAgentSession>
) {
  return (
    (await db
      .updateTable("meeting_agent_sessions")
      .set(input)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function listMeetingAgentEvents(meetingId: string) {
  return db
    .selectFrom("meeting_agent_events")
    .selectAll()
    .where("meeting_id", "=", meetingId)
    .orderBy("created_at", "asc")
    .execute();
}

export async function createMeetingAgentEvent(input: NewMeetingAgentEvent) {
  return (
    (await db.insertInto("meeting_agent_events").values(input).returningAll().executeTakeFirst()) ??
    null
  );
}

export async function listFinalSegmentsAfter(
  meetingId: string,
  afterSegmentId: string | null,
  limit = 50
) {
  let query = db
    .selectFrom("meeting_transcript_segments")
    .selectAll()
    .where("meeting_id", "=", meetingId)
    .where("is_partial", "=", false);

  if (afterSegmentId) {
    const cursor = await db
      .selectFrom("meeting_transcript_segments")
      .select("created_at")
      .where("id", "=", afterSegmentId)
      .limit(1)
      .executeTakeFirst();

    if (cursor) {
      query = query.where("created_at", ">=", cursor.created_at).where("id", "!=", afterSegmentId);
    }
  }

  return query.orderBy("created_at", "asc").limit(limit).execute();
}

export async function listAutonomousActiveSessions() {
  const rows = await db
    .selectFrom("meeting_agent_sessions")
    .innerJoin("agents", "meeting_agent_sessions.agent_id", "agents.id")
    .select([
      "meeting_agent_sessions.id as session_id",
      "meeting_agent_sessions.meeting_id",
      "meeting_agent_sessions.agent_id",
      "meeting_agent_sessions.state",
      "meeting_agent_sessions.invoked_by_user_id",
      "meeting_agent_sessions.last_auto_eval_segment_id",
      "meeting_agent_sessions.joined_at as session_joined_at",
      "meeting_agent_sessions.left_at as session_left_at",
      "meeting_agent_sessions.created_at as session_created_at",
      "agents.id as agent_table_id",
      "agents.name",
      "agents.description",
      "agents.system_prompt",
      "agents.voice_profile",
      "agents.intervention_style",
      "agents.default_provider",
      "agents.is_active",
      "agents.autonomous_enabled",
      "agents.autonomous_cooldown_sec",
      "agents.created_by",
      "agents.created_at as agent_created_at",
      "agents.updated_at as agent_updated_at",
    ])
    .where("meeting_agent_sessions.state", "=", "active")
    .where("agents.autonomous_enabled", "=", true)
    .where("agents.is_active", "=", true)
    .execute();

  return rows.map((r) => ({
    session: {
      id: r.session_id,
      meeting_id: r.meeting_id,
      agent_id: r.agent_id,
      state: r.state,
      invoked_by_user_id: r.invoked_by_user_id,
      last_auto_eval_segment_id: r.last_auto_eval_segment_id,
      joined_at: r.session_joined_at,
      left_at: r.session_left_at,
      created_at: r.session_created_at,
    },
    agent: {
      id: r.agent_table_id,
      name: r.name,
      description: r.description,
      system_prompt: r.system_prompt,
      voice_profile: r.voice_profile,
      intervention_style: r.intervention_style,
      default_provider: r.default_provider,
      is_active: r.is_active,
      autonomous_enabled: r.autonomous_enabled,
      autonomous_cooldown_sec: r.autonomous_cooldown_sec,
      created_by: r.created_by,
      created_at: r.agent_created_at,
      updated_at: r.agent_updated_at,
    },
  }));
}

export async function updateSessionEvalCursor(sessionId: string, segmentId: string) {
  return (
    (await db
      .updateTable("meeting_agent_sessions")
      .set({ last_auto_eval_segment_id: segmentId })
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
    .select("created_at")
    .where("meeting_id", "=", meetingId)
    .where("agent_id", "=", agentId)
    .where("event_type", "=", "response.autonomous")
    .orderBy("created_at", "desc")
    .limit(1)
    .executeTakeFirst();

  return event?.created_at ?? null;
}
