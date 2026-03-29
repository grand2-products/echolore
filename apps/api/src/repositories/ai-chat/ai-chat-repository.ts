import { sql } from "kysely";
import { db } from "../../db/index.js";
import type { NewAiChatConversation, NewAiChatMessage } from "../../db/schema.js";
import { escapeLikePattern, firstOrNull } from "../../lib/db-utils.js";

export async function createConversation(conversation: NewAiChatConversation) {
  return firstOrNull(
    await db.insertInto("ai_chat_conversations").values(conversation).returningAll().execute()
  );
}

export async function getConversationById(id: string) {
  return firstOrNull(
    await db.selectFrom("ai_chat_conversations").selectAll().where("id", "=", id).execute()
  );
}

export async function listConversations(opts: { userId?: string; query?: string }) {
  let query = db
    .selectFrom("ai_chat_conversations")
    .leftJoin("users", "ai_chat_conversations.creator_id", "users.id")
    .select([
      "ai_chat_conversations.id",
      "ai_chat_conversations.title",
      "ai_chat_conversations.creator_id",
      "ai_chat_conversations.visibility",
      "ai_chat_conversations.created_at",
      "ai_chat_conversations.updated_at",
      "users.name as creator_name",
    ]);

  if (opts.userId) {
    query = query.where((eb) =>
      eb.or([
        eb("ai_chat_conversations.visibility", "=", "team"),
        eb("ai_chat_conversations.creator_id", "=", opts.userId as string),
      ])
    );
  } else {
    query = query.where("ai_chat_conversations.visibility", "=", "team");
  }

  if (opts.query) {
    const pattern = `%${escapeLikePattern(opts.query)}%`;
    query = query.where(
      sql`coalesce(${sql.ref("ai_chat_conversations.title")}, '')`,
      "ilike",
      pattern
    );
  }

  return query.orderBy("ai_chat_conversations.updated_at", "desc").execute();
}

export async function updateConversation(
  id: string,
  payload: { title?: string; visibility?: string; updatedAt: Date }
) {
  const { updatedAt, ...rest } = payload;
  return firstOrNull(
    await db
      .updateTable("ai_chat_conversations")
      .set({ ...rest, updated_at: updatedAt })
      .where("id", "=", id)
      .returningAll()
      .execute()
  );
}

export async function deleteConversation(id: string) {
  await db.deleteFrom("ai_chat_conversations").where("id", "=", id).execute();
}

export async function createMessage(message: NewAiChatMessage) {
  return firstOrNull(
    await db.insertInto("ai_chat_messages").values(message).returningAll().execute()
  );
}

export async function listMessagesByConversationId(conversationId: string) {
  return db
    .selectFrom("ai_chat_messages")
    .selectAll()
    .where("conversation_id", "=", conversationId)
    .orderBy("created_at")
    .execute();
}

export async function listRecentMessages(conversationId: string, limit = 20) {
  const rows = await db
    .selectFrom("ai_chat_messages")
    .selectAll()
    .where("conversation_id", "=", conversationId)
    .orderBy("created_at", "desc")
    .limit(limit)
    .execute();
  return rows.reverse();
}

/** Batch: get message counts and last messages for multiple conversations in 2 queries */
export async function getConversationStats(conversationIds: string[]) {
  if (conversationIds.length === 0)
    return new Map<string, { count: number; lastContent: string | null }>();

  const [counts, lastMessages] = await Promise.all([
    db
      .selectFrom("ai_chat_messages")
      .select(["conversation_id", sql<number>`count(*)::int`.as("count")])
      .where("conversation_id", "in", conversationIds)
      .groupBy("conversation_id")
      .execute(),
    (() => {
      const maxCreatedAt = db
        .selectFrom("ai_chat_messages")
        .select(["conversation_id", sql`max(${sql.ref("created_at")})`.as("max_created_at")])
        .where("conversation_id", "in", conversationIds)
        .groupBy("conversation_id")
        .as("last_msg");

      return db
        .selectFrom("ai_chat_messages")
        .innerJoin(maxCreatedAt, (join) =>
          join
            .onRef("ai_chat_messages.conversation_id", "=", "last_msg.conversation_id")
            .onRef("ai_chat_messages.created_at", "=", "last_msg.max_created_at")
        )
        .select([
          "ai_chat_messages.conversation_id",
          "ai_chat_messages.content",
          "ai_chat_messages.created_at",
        ])
        .execute();
    })(),
  ]);

  const result = new Map<string, { count: number; lastContent: string | null }>();
  for (const id of conversationIds) {
    result.set(id, { count: 0, lastContent: null });
  }
  for (const row of counts) {
    const entry = result.get(row.conversation_id);
    if (entry) entry.count = row.count;
  }
  for (const row of lastMessages) {
    const entry = result.get(row.conversation_id);
    if (entry) entry.lastContent = row.content?.slice(0, 100) ?? null;
  }

  return result;
}
