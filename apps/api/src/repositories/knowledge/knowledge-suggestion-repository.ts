import { sql } from "kysely";
import { db } from "../../db/index.js";
import type { KnowledgeSuggestion, NewKnowledgeSuggestion } from "../../db/schema.js";

export async function listSuggestions(filters?: {
  status?: string;
  sourceType?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: KnowledgeSuggestion[]; total: number }> {
  let baseQuery = db.selectFrom("knowledge_suggestions");

  if (filters?.status) {
    baseQuery = baseQuery.where("status", "=", filters.status);
  }
  if (filters?.sourceType) {
    baseQuery = baseQuery.where("sourceType", "=", filters.sourceType);
  }

  const [rows, countRow] = await Promise.all([
    baseQuery
      .selectAll()
      .orderBy("createdAt", "desc")
      .limit(filters?.limit ?? 50)
      .offset(filters?.offset ?? 0)
      .execute(),
    baseQuery.select(sql<number>`count(*)::int`.as("count")).executeTakeFirst(),
  ]);

  return { rows, total: countRow?.count ?? 0 };
}

export async function getSuggestionById(id: string): Promise<KnowledgeSuggestion | null> {
  return (
    (await db
      .selectFrom("knowledge_suggestions")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst()) ?? null
  );
}

export async function createSuggestion(
  input: NewKnowledgeSuggestion
): Promise<KnowledgeSuggestion> {
  const row = await db
    .insertInto("knowledge_suggestions")
    .values(input)
    .returningAll()
    .executeTakeFirst();
  if (!row) throw new Error("Failed to create knowledge suggestion");
  return row;
}

export async function updateSuggestion(
  id: string,
  updates: Partial<
    Pick<
      KnowledgeSuggestion,
      | "status"
      | "reviewedByUserId"
      | "reviewedAt"
      | "rejectionReason"
      | "resultPageId"
      | "updatedAt"
    >
  >
): Promise<KnowledgeSuggestion | null> {
  return (
    (await db
      .updateTable("knowledge_suggestions")
      .set(updates)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}
