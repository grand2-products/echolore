import { db } from "../../db/index.js";
import type { NewAituberCharacter, NewAituberMessage, NewAituberSession } from "../../db/schema.js";
import { getRecordById } from "../../lib/db-utils.js";

// --- Characters ---

export async function createCharacter(character: NewAituberCharacter) {
  return (
    (await db
      .insertInto("aituber_characters")
      .values(character)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function getCharacterById(id: string) {
  return getRecordById("aituber_characters", id);
}

export async function listCharacters(opts?: { createdBy?: string }) {
  let query = db.selectFrom("aituber_characters").selectAll();
  if (opts?.createdBy) {
    query = query.where("created_by", "=", opts.createdBy);
  }
  return query.orderBy("created_at", "desc").execute();
}

export async function updateCharacter(
  id: string,
  payload: Partial<{
    name: string;
    personality: string;
    systemPrompt: string;
    speakingStyle: string | null;
    languageCode: string;
    voiceName: string | null;
    avatarUrl: string | null;
    avatarFileId: string | null;
    isPublic: boolean;
    updatedAt: Date;
  }>
) {
  const mapped: Record<string, unknown> = {};
  if (payload.name !== undefined) mapped.name = payload.name;
  if (payload.personality !== undefined) mapped.personality = payload.personality;
  if (payload.systemPrompt !== undefined) mapped.system_prompt = payload.systemPrompt;
  if (payload.speakingStyle !== undefined) mapped.speaking_style = payload.speakingStyle;
  if (payload.languageCode !== undefined) mapped.language_code = payload.languageCode;
  if (payload.voiceName !== undefined) mapped.voice_name = payload.voiceName;
  if (payload.avatarUrl !== undefined) mapped.avatar_url = payload.avatarUrl;
  if (payload.avatarFileId !== undefined) mapped.avatar_file_id = payload.avatarFileId;
  if (payload.isPublic !== undefined) mapped.is_public = payload.isPublic;
  if (payload.updatedAt !== undefined) mapped.updated_at = payload.updatedAt;

  return (
    (await db
      .updateTable("aituber_characters")
      .set(mapped)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function deleteCharacter(id: string) {
  await db.deleteFrom("aituber_characters").where("id", "=", id).execute();
}

// --- Sessions ---

export async function createSession(session: NewAituberSession) {
  return (
    (await db.insertInto("aituber_sessions").values(session).returningAll().executeTakeFirst()) ??
    null
  );
}

export async function getSessionById(id: string) {
  return getRecordById("aituber_sessions", id);
}

export async function listSessions(opts?: { status?: string; creatorId?: string }) {
  let query = db.selectFrom("aituber_sessions").selectAll();
  if (opts?.status) {
    query = query.where("status", "=", opts.status);
  }
  if (opts?.creatorId) {
    query = query.where("creator_id", "=", opts.creatorId);
  }
  return query.orderBy("created_at", "desc").execute();
}

export async function updateSession(
  id: string,
  payload: Partial<{
    status: string;
    startedAt: Date;
    endedAt: Date;
  }>
) {
  const mapped: Record<string, unknown> = {};
  if (payload.status !== undefined) mapped.status = payload.status;
  if (payload.startedAt !== undefined) mapped.started_at = payload.startedAt;
  if (payload.endedAt !== undefined) mapped.ended_at = payload.endedAt;

  return (
    (await db
      .updateTable("aituber_sessions")
      .set(mapped)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

/** Atomic status transition: only updates if current status matches expectedStatus */
export async function updateSessionWithStatus(
  id: string,
  expectedStatus: string,
  payload: Partial<{
    status: string;
    startedAt: Date;
    endedAt: Date;
  }>
) {
  const mapped: Record<string, unknown> = {};
  if (payload.status !== undefined) mapped.status = payload.status;
  if (payload.startedAt !== undefined) mapped.started_at = payload.startedAt;
  if (payload.endedAt !== undefined) mapped.ended_at = payload.endedAt;

  return (
    (await db
      .updateTable("aituber_sessions")
      .set(mapped)
      .where("id", "=", id)
      .where("status", "=", expectedStatus)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

// --- Messages ---

export async function createMessage(message: NewAituberMessage) {
  return (
    (await db.insertInto("aituber_messages").values(message).returningAll().executeTakeFirst()) ??
    null
  );
}

export async function listUnprocessedMessages(sessionId: string, limit = 10) {
  return db
    .selectFrom("aituber_messages")
    .selectAll()
    .where("session_id", "=", sessionId)
    .where("role", "=", "viewer")
    .where("processed_at", "is", null)
    .orderBy("created_at", "asc")
    .limit(limit)
    .execute();
}

export async function markMessageProcessed(id: string) {
  return (
    (await db
      .updateTable("aituber_messages")
      .set({ processed_at: new Date() })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function listMessagesBySession(sessionId: string, limit = 50) {
  return db
    .selectFrom("aituber_messages")
    .selectAll()
    .where("session_id", "=", sessionId)
    .orderBy("created_at", "desc")
    .limit(limit)
    .execute();
}

export async function listRecentMessages(sessionId: string, limit = 20) {
  const rows = await db
    .selectFrom("aituber_messages")
    .selectAll()
    .where("session_id", "=", sessionId)
    .orderBy("created_at", "desc")
    .limit(limit)
    .execute();
  return rows.reverse();
}
