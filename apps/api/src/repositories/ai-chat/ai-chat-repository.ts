import { and, desc, eq, inArray, max, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  type NewAiChatConversation,
  type NewAiChatMessage,
  aiChatConversations,
  aiChatMessages,
  users,
} from "../../db/schema.js";

export async function createConversation(conversation: NewAiChatConversation) {
  const [row] = await db.insert(aiChatConversations).values(conversation).returning();
  return row ?? null;
}

export async function getConversationById(id: string) {
  const [row] = await db.select().from(aiChatConversations).where(eq(aiChatConversations.id, id));
  return row ?? null;
}

export async function listConversations(opts: { userId?: string; query?: string }) {
  const conditions = [];

  if (opts.userId) {
    conditions.push(
      or(eq(aiChatConversations.visibility, "team"), eq(aiChatConversations.creatorId, opts.userId))
    );
  } else {
    conditions.push(eq(aiChatConversations.visibility, "team"));
  }

  if (opts.query) {
    conditions.push(
      sql<boolean>`coalesce(${aiChatConversations.title}, '') ilike ${`%${opts.query}%`}`
    );
  }

  return db
    .select({
      conversation: aiChatConversations,
      creatorName: users.name,
    })
    .from(aiChatConversations)
    .leftJoin(users, eq(aiChatConversations.creatorId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(aiChatConversations.updatedAt));
}

export async function updateConversation(
  id: string,
  payload: { title?: string; visibility?: string; updatedAt: Date }
) {
  const [row] = await db
    .update(aiChatConversations)
    .set(payload)
    .where(eq(aiChatConversations.id, id))
    .returning();
  return row ?? null;
}

export async function deleteConversation(id: string) {
  await db.delete(aiChatConversations).where(eq(aiChatConversations.id, id));
}

export async function createMessage(message: NewAiChatMessage) {
  const [row] = await db.insert(aiChatMessages).values(message).returning();
  return row ?? null;
}

export async function listMessagesByConversationId(conversationId: string) {
  return db
    .select()
    .from(aiChatMessages)
    .where(eq(aiChatMessages.conversationId, conversationId))
    .orderBy(aiChatMessages.createdAt);
}

export async function getRecentMessages(conversationId: string, limit = 20) {
  const rows = await db
    .select()
    .from(aiChatMessages)
    .where(eq(aiChatMessages.conversationId, conversationId))
    .orderBy(desc(aiChatMessages.createdAt))
    .limit(limit);
  return rows.reverse();
}

/** Batch: get message counts and last messages for multiple conversations in 2 queries */
export async function getConversationStats(conversationIds: string[]) {
  if (conversationIds.length === 0)
    return new Map<string, { count: number; lastContent: string | null }>();

  const [counts, lastMessages] = await Promise.all([
    db
      .select({
        conversationId: aiChatMessages.conversationId,
        count: sql<number>`count(*)::int`,
      })
      .from(aiChatMessages)
      .where(inArray(aiChatMessages.conversationId, conversationIds))
      .groupBy(aiChatMessages.conversationId),
    (() => {
      const maxCreatedAt = db
        .select({
          conversationId: aiChatMessages.conversationId,
          maxCreatedAt: max(aiChatMessages.createdAt).as("max_created_at"),
        })
        .from(aiChatMessages)
        .where(inArray(aiChatMessages.conversationId, conversationIds))
        .groupBy(aiChatMessages.conversationId)
        .as("last_msg");

      return db
        .select({
          conversationId: aiChatMessages.conversationId,
          content: aiChatMessages.content,
          createdAt: aiChatMessages.createdAt,
        })
        .from(aiChatMessages)
        .innerJoin(
          maxCreatedAt,
          and(
            eq(aiChatMessages.conversationId, maxCreatedAt.conversationId),
            eq(aiChatMessages.createdAt, maxCreatedAt.maxCreatedAt)
          )
        );
    })(),
  ]);

  const result = new Map<string, { count: number; lastContent: string | null }>();
  for (const id of conversationIds) {
    result.set(id, { count: 0, lastContent: null });
  }
  for (const row of counts) {
    const entry = result.get(row.conversationId);
    if (entry) entry.count = row.count;
  }
  for (const row of lastMessages) {
    const entry = result.get(row.conversationId);
    if (entry) entry.lastContent = row.content?.slice(0, 100) ?? null;
  }

  return result;
}
