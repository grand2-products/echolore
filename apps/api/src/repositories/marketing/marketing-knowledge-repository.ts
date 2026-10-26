import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import type { MarketingKnowledgePage, MarketingReconciliation } from "../../db/schema.js";

// ─── Knowledge registry ──────────────────────────────────────────

export type KnowledgeRow = MarketingKnowledgePage & {
  pageTitle: string | null;
  pageAuthorId: string | null;
  pageUpdatedAt: Date | null;
  pageDeletedAt: Date | null;
};

const knowledgeQuery = () =>
  db
    .selectFrom("marketing_knowledge_pages as k")
    .leftJoin("pages as p", "p.id", "k.pageId")
    .selectAll("k")
    .select([
      "p.title as pageTitle",
      "p.authorId as pageAuthorId",
      "p.updatedAt as pageUpdatedAt",
      "p.deletedAt as pageDeletedAt",
    ]);

export async function listKnowledgePages(): Promise<KnowledgeRow[]> {
  return knowledgeQuery().orderBy("k.layer").orderBy("p.title").execute();
}

export async function getKnowledgePageById(id: string): Promise<KnowledgeRow | null> {
  return (await knowledgeQuery().where("k.id", "=", id).executeTakeFirst()) ?? null;
}

export async function getKnowledgePageByPageId(pageId: string): Promise<KnowledgeRow | null> {
  return (await knowledgeQuery().where("k.pageId", "=", pageId).executeTakeFirst()) ?? null;
}

export async function createKnowledgePage(input: {
  pageId: string;
  layer: string;
  docType: string;
  purpose: string | null;
  scope: string | null;
  ownerUserId: string | null;
  deputyUserId: string | null;
  reviewIntervalDays: number;
  relatedAssetIds: string[];
  notes: string | null;
}): Promise<MarketingKnowledgePage> {
  const now = new Date();
  return db
    .insertInto("marketing_knowledge_pages")
    .values({
      id: `mkk_${nanoid(16)}`,
      ...input,
      status: "draft",
      lastReviewedAt: null,
      nextReviewAt: new Date(now.getTime() + input.reviewIntervalDays * 86_400_000),
      approvedByUserId: null,
      approvedAt: null,
      replacedByPageId: null,
      createdAt: now,
      updatedAt: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateKnowledgePage(
  id: string,
  patch: Partial<Omit<MarketingKnowledgePage, "id" | "pageId" | "createdAt">>
): Promise<MarketingKnowledgePage | null> {
  return (
    (await db
      .updateTable("marketing_knowledge_pages")
      .set({ ...patch, updatedAt: new Date() })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function deleteKnowledgePage(id: string): Promise<void> {
  await db.deleteFrom("marketing_knowledge_pages").where("id", "=", id).execute();
}

// ─── Reconciliations ─────────────────────────────────────────────

export async function listReconciliations(limit = 200): Promise<MarketingReconciliation[]> {
  return db
    .selectFrom("marketing_reconciliations")
    .selectAll()
    .orderBy("createdAt", "desc")
    .limit(limit)
    .execute();
}

export async function getReconciliationById(id: string): Promise<MarketingReconciliation | null> {
  return (
    (await db
      .selectFrom("marketing_reconciliations")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst()) ?? null
  );
}

export async function createReconciliation(input: {
  connectorId: string;
  metric: string;
  periodFrom: string;
  periodTo: string;
  systemValue: number;
  sourceValue: number;
  tolerancePct: number;
  explanation: string | null;
  createdByUserId: string;
}): Promise<MarketingReconciliation> {
  return db
    .insertInto("marketing_reconciliations")
    .values({
      id: `mkrc_${nanoid(16)}`,
      ...input,
      status: "pending",
      reviewedByUserId: null,
      reviewedAt: null,
      reviewComment: null,
      createdAt: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function reviewReconciliation(
  id: string,
  input: { status: string; reviewedByUserId: string; reviewComment: string | null }
): Promise<MarketingReconciliation | null> {
  return (
    (await db
      .updateTable("marketing_reconciliations")
      .set({ ...input, reviewedAt: new Date() })
      .where("id", "=", id)
      .where("status", "=", "pending")
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function countPendingReconciliations(): Promise<number> {
  const row = await db
    .selectFrom("marketing_reconciliations")
    .select(db.fn.countAll<string>().as("n"))
    .where("status", "=", "pending")
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

// ─── Shared lookups ──────────────────────────────────────────────

export async function getUserNameMap(ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map<string, string>();
  const rows = await db
    .selectFrom("users")
    .select(["id", "name"])
    .where("id", "in", unique)
    .execute();
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function getPageTitleMap(ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map<string, string>();
  const rows = await db
    .selectFrom("pages")
    .select(["id", "title"])
    .where("id", "in", unique)
    .where("deletedAt", "is", null)
    .execute();
  return new Map(rows.map((r) => [r.id, r.title]));
}

export async function pageExists(id: string): Promise<boolean> {
  const row = await db
    .selectFrom("pages")
    .select("id")
    .where("id", "=", id)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  return Boolean(row);
}

export async function userExists(id: string): Promise<boolean> {
  const row = await db
    .selectFrom("users")
    .select("id")
    .where("id", "=", id)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  return Boolean(row);
}
