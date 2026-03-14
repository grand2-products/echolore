import { and, desc, eq, inArray, max, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  type NewWikiChatConversation,
  type NewWikiChatMessage,
  users,
  wikiChatConversations,
  wikiChatMessages,
} from "../../db/schema.js";

export async function createConversation(conversation: NewWikiChatConversation) {
  const [row] = await db.insert(wikiChatConversations).values(conversation).returning();
  return row ?? null;
}

export async function getConversationById(id: string) {
  const [row] = await db.select().from(wikiChatConversations).where(eq(wikiChatConversations.id, id));
  return row ?? null;
}

export async function listConversations(opts: { userId?: string; query?: string }) {
  const conditions = [];

  if (opts.userId) {
    conditions.push(
      or(
        eq(wikiChatConversations.visibility, "team"),
        eq(wikiChatConversations.creatorId, opts.userId)
      )
    );
  } else {
    conditions.push(eq(wikiChatConversations.visibility, "team"));
  }

  if (opts.query) {
    conditions.push(
      sql<boolean>`coalesce(${wikiChatConversations.title}, '') ilike ${`%${opts.query}%`}`
    );
  }

  return db
    .select({
      conversation: wikiChatConversations,
      creatorName: users.name,
    })
    .from(wikiChatConversations)
    .leftJoin(users, eq(wikiChatConversations.creatorId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(wikiChatConversations.updatedAt));
}

export async function updateConversation(
  id: string,
  payload: { title?: string; visibility?: string; updatedAt: Date }
) {
  const [row] = await db
    .update(wikiChatConversations)
    .set(payload)
    .where(eq(wikiChatConversations.id, id))
    .returning();
  return row ?? null;
}

export async function deleteConversation(id: string) {
  await db.delete(wikiChatConversations).where(eq(wikiChatConversations.id, id));
}

export async function createMessage(message: NewWikiChatMessage) {
  const [row] = await db.insert(wikiChatMessages).values(message).returning();
  return row ?? null;
}

export async function listMessagesByConversationId(conversationId: string) {
  return db
    .select()
    .from(wikiChatMessages)
    .where(eq(wikiChatMessages.conversationId, conversationId))
    .orderBy(wikiChatMessages.createdAt);
}

export async function getRecentMessages(conversationId: string, limit = 20) {
  const rows = await db
    .select()
    .from(wikiChatMessages)
    .where(eq(wikiChatMessages.conversationId, conversationId))
    .orderBy(desc(wikiChatMessages.createdAt))
    .limit(limit);
  return rows.reverse();
}

/** Batch: get message counts and last messages for multiple conversations in 2 queries */
export async function getConversationStats(conversationIds: string[]) {
  if (conversationIds.length === 0) return new Map<string, { count: number; lastContent: string | null }>();

  const [counts, lastMessages] = await Promise.all([
    db
      .select({
        conversationId: wikiChatMessages.conversationId,
        count: sql<number>`count(*)::int`,
      })
      .from(wikiChatMessages)
      .where(inArray(wikiChatMessages.conversationId, conversationIds))
      .groupBy(wikiChatMessages.conversationId),
    (() => {
      const maxCreatedAt = db
        .select({
          conversationId: wikiChatMessages.conversationId,
          maxCreatedAt: max(wikiChatMessages.createdAt).as("max_created_at"),
        })
        .from(wikiChatMessages)
        .where(inArray(wikiChatMessages.conversationId, conversationIds))
        .groupBy(wikiChatMessages.conversationId)
        .as("last_msg");

      return db
        .select({
          conversationId: wikiChatMessages.conversationId,
          content: wikiChatMessages.content,
          createdAt: wikiChatMessages.createdAt,
        })
        .from(wikiChatMessages)
        .innerJoin(
          maxCreatedAt,
          and(
            eq(wikiChatMessages.conversationId, maxCreatedAt.conversationId),
            eq(wikiChatMessages.createdAt, maxCreatedAt.maxCreatedAt),
          ),
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
