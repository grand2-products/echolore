import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  aituberCharacters,
  aituberMessages,
  aituberSessions,
  type NewAituberCharacter,
  type NewAituberMessage,
  type NewAituberSession,
} from "../../db/schema.js";

// --- Characters ---

export async function createCharacter(character: NewAituberCharacter) {
  const [row] = await db.insert(aituberCharacters).values(character).returning();
  return row ?? null;
}

export async function getCharacterById(id: string) {
  const [row] = await db.select().from(aituberCharacters).where(eq(aituberCharacters.id, id));
  return row ?? null;
}

export async function listCharacters(opts?: { createdBy?: string }) {
  const conditions = [];
  if (opts?.createdBy) {
    conditions.push(eq(aituberCharacters.createdBy, opts.createdBy));
  }
  return db
    .select()
    .from(aituberCharacters)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(aituberCharacters.createdAt));
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
    isPublic: boolean;
    updatedAt: Date;
  }>
) {
  const [row] = await db
    .update(aituberCharacters)
    .set(payload)
    .where(eq(aituberCharacters.id, id))
    .returning();
  return row ?? null;
}

export async function deleteCharacter(id: string) {
  await db.delete(aituberCharacters).where(eq(aituberCharacters.id, id));
}

// --- Sessions ---

export async function createSession(session: NewAituberSession) {
  const [row] = await db.insert(aituberSessions).values(session).returning();
  return row ?? null;
}

export async function getSessionById(id: string) {
  const [row] = await db.select().from(aituberSessions).where(eq(aituberSessions.id, id));
  return row ?? null;
}

export async function listSessions(opts?: { status?: string; creatorId?: string }) {
  const conditions = [];
  if (opts?.status) {
    conditions.push(eq(aituberSessions.status, opts.status));
  }
  if (opts?.creatorId) {
    conditions.push(eq(aituberSessions.creatorId, opts.creatorId));
  }
  return db
    .select()
    .from(aituberSessions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(aituberSessions.createdAt));
}

export async function updateSession(
  id: string,
  payload: Partial<{
    status: string;
    startedAt: Date;
    endedAt: Date;
  }>
) {
  const [row] = await db
    .update(aituberSessions)
    .set(payload)
    .where(eq(aituberSessions.id, id))
    .returning();
  return row ?? null;
}

// --- Messages ---

export async function createMessage(message: NewAituberMessage) {
  const [row] = await db.insert(aituberMessages).values(message).returning();
  return row ?? null;
}

export async function getUnprocessedMessages(sessionId: string, limit = 10) {
  return db
    .select()
    .from(aituberMessages)
    .where(
      and(
        eq(aituberMessages.sessionId, sessionId),
        eq(aituberMessages.role, "viewer"),
        isNull(aituberMessages.processedAt)
      )
    )
    .orderBy(asc(aituberMessages.createdAt))
    .limit(limit);
}

export async function markMessageProcessed(id: string) {
  const [row] = await db
    .update(aituberMessages)
    .set({ processedAt: new Date() })
    .where(eq(aituberMessages.id, id))
    .returning();
  return row ?? null;
}

export async function listMessagesBySession(sessionId: string, limit = 50) {
  return db
    .select()
    .from(aituberMessages)
    .where(eq(aituberMessages.sessionId, sessionId))
    .orderBy(desc(aituberMessages.createdAt))
    .limit(limit);
}

export async function getRecentMessages(sessionId: string, limit = 20) {
  const rows = await db
    .select()
    .from(aituberMessages)
    .where(eq(aituberMessages.sessionId, sessionId))
    .orderBy(desc(aituberMessages.createdAt))
    .limit(limit);
  return rows.reverse();
}
