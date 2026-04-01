import { sql } from "kysely";
import { db } from "../../db/index.js";
import type {
  AiChatConversation,
  AiChatMessage,
  NewAiChatConversation,
  NewAiChatMessage,
} from "../../db/schema.js";
import { escapeLikePattern, firstOrNull } from "../../lib/db-utils.js";

export async function createConversation(
  conversation: NewAiChatConversation
): Promise<AiChatConversation | null> {
  return firstOrNull(
    await db.insertInto("ai_chat_conversations").values(conversation).returningAll().execute()
  );
}

export async function getConversationById(id: string): Promise<AiChatConversation | null> {
  return firstOrNull(
    await db.selectFrom("ai_chat_conversations").selectAll().where("id", "=", id).execute()
  );
}

export async function listConversations(opts: {
  userId?: string;
  query?: string;
}): Promise<
  Array<
    Pick<
      AiChatConversation,
      "id" | "title" | "creatorId" | "visibility" | "createdAt" | "updatedAt"
    > & { creatorName: string | null }
  >
> {
  let query = db
    .selectFrom("ai_chat_conversations")
    .leftJoin("users", "ai_chat_conversations.creatorId", "users.id")
    .select([
      "ai_chat_conversations.id",
      "ai_chat_conversations.title",
      "ai_chat_conversations.creatorId",
      "ai_chat_conversations.visibility",
      "ai_chat_conversations.createdAt",
      "ai_chat_conversations.updatedAt",
      "users.name as creatorName",
    ]);

  if (opts.userId) {
    query = query.where((eb) =>
      eb.or([
        eb("ai_chat_conversations.visibility", "=", "public"),
        eb("ai_chat_conversations.creatorId", "=", opts.userId as string),
      ])
    );
  } else {
    query = query.where("ai_chat_conversations.visibility", "=", "public");
  }

  if (opts.query) {
    const pattern = `%${escapeLikePattern(opts.query)}%`;
    query = query.where(
      sql`coalesce(${sql.ref("ai_chat_conversations.title")}, '')`,
      "ilike",
      pattern
    );
  }

  return query.orderBy("ai_chat_conversations.updatedAt", "desc").execute();
}

export async function updateConversation(
  id: string,
  payload: { title?: string; visibility?: string; updatedAt: Date }
): Promise<AiChatConversation | null> {
  const { updatedAt, ...rest } = payload;
  return firstOrNull(
    await db
      .updateTable("ai_chat_conversations")
      .set({ ...rest, updatedAt: updatedAt })
      .where("id", "=", id)
      .returningAll()
      .execute()
  );
}

export async function deleteConversation(id: string): Promise<void> {
  await db.deleteFrom("ai_chat_conversations").where("id", "=", id).execute();
}

export async function createMessage(message: NewAiChatMessage): Promise<AiChatMessage | null> {
  return firstOrNull(
    await db.insertInto("ai_chat_messages").values(message).returningAll().execute()
  );
}

export async function listMessagesByConversationId(
  conversationId: string
): Promise<AiChatMessage[]> {
  return db
    .selectFrom("ai_chat_messages")
    .selectAll()
    .where("conversationId", "=", conversationId)
    .orderBy("createdAt")
    .execute();
}

export async function listRecentMessages(
  conversationId: string,
  limit = 20
): Promise<AiChatMessage[]> {
  const rows = await db
    .selectFrom("ai_chat_messages")
    .selectAll()
    .where("conversationId", "=", conversationId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .execute();
  return rows.reverse();
}

/** Batch: get message counts and last messages for multiple conversations in 2 queries */
export async function getConversationStats(
  conversationIds: string[]
): Promise<Map<string, { count: number; lastContent: string | null }>> {
  if (conversationIds.length === 0)
    return new Map<string, { count: number; lastContent: string | null }>();

  const [counts, lastMessages] = await Promise.all([
    db
      .selectFrom("ai_chat_messages")
      .select(["conversationId", sql<number>`count(*)::int`.as("count")])
      .where("conversationId", "in", conversationIds)
      .groupBy("conversationId")
      .execute(),
    (() => {
      const maxCreatedAt = db
        .selectFrom("ai_chat_messages")
        .select(["conversationId", sql`max(${sql.ref("created_at")})`.as("max_created_at")])
        .where("conversationId", "in", conversationIds)
        .groupBy("conversationId")
        .as("last_msg");

      return db
        .selectFrom("ai_chat_messages")
        .innerJoin(maxCreatedAt, (join) =>
          join
            .onRef("ai_chat_messages.conversationId", "=", "last_msg.conversationId")
            .onRef("ai_chat_messages.createdAt", "=", "last_msg.max_created_at")
        )
        .select([
          "ai_chat_messages.conversationId",
          "ai_chat_messages.content",
          "ai_chat_messages.createdAt",
        ])
        .execute();
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
