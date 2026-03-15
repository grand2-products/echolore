import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import type { KnowledgeSuggestion, NewKnowledgeSuggestion } from "../../db/schema.js";
import { knowledgeSuggestions } from "../../db/schema.js";

export async function listSuggestions(filters?: {
  status?: string;
  sourceType?: string;
  limit?: number;
  offset?: number;
}): Promise<{ rows: KnowledgeSuggestion[]; total: number }> {
  const conditions = [];
  if (filters?.status) {
    conditions.push(eq(knowledgeSuggestions.status, filters.status));
  }
  if (filters?.sourceType) {
    conditions.push(eq(knowledgeSuggestions.sourceType, filters.sourceType));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [countRow]] = await Promise.all([
    db
      .select()
      .from(knowledgeSuggestions)
      .where(where)
      .orderBy(desc(knowledgeSuggestions.createdAt))
      .limit(filters?.limit ?? 50)
      .offset(filters?.offset ?? 0),
    db.select({ count: sql<number>`count(*)::int` }).from(knowledgeSuggestions).where(where),
  ]);

  return { rows, total: countRow?.count ?? 0 };
}

export async function getSuggestionById(id: string): Promise<KnowledgeSuggestion | null> {
  const [row] = await db.select().from(knowledgeSuggestions).where(eq(knowledgeSuggestions.id, id));
  return row ?? null;
}

export async function createSuggestion(
  input: NewKnowledgeSuggestion
): Promise<KnowledgeSuggestion> {
  const [row] = await db.insert(knowledgeSuggestions).values(input).returning();
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
  const [row] = await db
    .update(knowledgeSuggestions)
    .set(updates)
    .where(eq(knowledgeSuggestions.id, id))
    .returning();
  return row ?? null;
}
