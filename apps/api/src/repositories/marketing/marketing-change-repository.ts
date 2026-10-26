import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import type { MarketingChangeEvent, MarketingChangeRequest } from "../../db/schema.js";

export type ChangeFields = {
  type: string;
  title: string;
  purpose?: string | null;
  assetId?: string | null;
  severity?: string | null;
  beforeState?: string | null;
  afterState?: string | null;
  impact?: string | null;
  rollbackPlan?: string | null;
  scheduledAt?: Date | null;
  evidenceUrls?: string[];
  wikiPageId?: string | null;
};

export async function listChanges(filters: {
  status?: string[];
  type?: string;
  assetId?: string;
  limit: number;
}): Promise<MarketingChangeRequest[]> {
  let q = db.selectFrom("marketing_change_requests").selectAll();
  if (filters.status?.length) q = q.where("status", "in", filters.status);
  if (filters.type) q = q.where("type", "=", filters.type);
  if (filters.assetId) q = q.where("assetId", "=", filters.assetId);
  return q.orderBy("updatedAt", "desc").limit(filters.limit).execute();
}

export async function getChangeById(id: string): Promise<MarketingChangeRequest | null> {
  return (
    (await db
      .selectFrom("marketing_change_requests")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst()) ?? null
  );
}

export async function createChange(
  fields: ChangeFields,
  actorUserId: string
): Promise<MarketingChangeRequest> {
  const now = new Date();
  return db.transaction().execute(async (trx) => {
    const change = await trx
      .insertInto("marketing_change_requests")
      .values({
        id: `mkch_${nanoid(16)}`,
        ...fields,
        evidenceUrls: fields.evidenceUrls ?? [],
        status: "open",
        requestedByUserId: actorUserId,
        approvedByUserId: null,
        approvedAt: null,
        implementedByUserId: null,
        implementedAt: null,
        verifiedByUserId: null,
        verifiedAt: null,
        verificationNote: null,
        postReviewDueAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("marketing_change_events")
      .values({
        id: `mkce_${nanoid(16)}`,
        changeId: change.id,
        action: "create",
        fromStatus: null,
        toStatus: "open",
        actorUserId,
        comment: null,
        createdAt: now,
      })
      .execute();
    return change;
  });
}

/**
 * Applies a field patch and records the event atomically. The status
 * precondition makes concurrent transitions fail instead of double-applying.
 */
export async function applyChangeUpdate(input: {
  id: string;
  expectedStatus: string;
  patch: Partial<MarketingChangeRequest>;
  event: {
    action: string;
    fromStatus: string | null;
    toStatus: string | null;
    comment: string | null;
  };
  actorUserId: string;
}): Promise<MarketingChangeRequest | null> {
  const now = new Date();
  return db.transaction().execute(async (trx) => {
    const { id: _id, createdAt: _c, ...patch } = input.patch;
    const updated = await trx
      .updateTable("marketing_change_requests")
      .set({ ...patch, updatedAt: now })
      .where("id", "=", input.id)
      .where("status", "=", input.expectedStatus)
      .returningAll()
      .executeTakeFirst();
    if (!updated) return null;
    await trx
      .insertInto("marketing_change_events")
      .values({
        id: `mkce_${nanoid(16)}`,
        changeId: input.id,
        ...input.event,
        actorUserId: input.actorUserId,
        createdAt: now,
      })
      .execute();
    return updated;
  });
}

export async function listChangeEvents(changeId: string): Promise<MarketingChangeEvent[]> {
  return db
    .selectFrom("marketing_change_events")
    .selectAll()
    .where("changeId", "=", changeId)
    .orderBy("createdAt")
    .execute();
}

export async function countChangesByStatus(): Promise<Record<string, number>> {
  const rows = await db
    .selectFrom("marketing_change_requests")
    .select(["status", db.fn.countAll<string>().as("n")])
    .groupBy("status")
    .execute();
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
}

export async function countPostReviewOverdue(now: Date): Promise<number> {
  const row = await db
    .selectFrom("marketing_change_requests")
    .select(db.fn.countAll<string>().as("n"))
    .where("postReviewDueAt", "<", now)
    .where("approvedAt", "is", null)
    .where("status", "!=", "closed")
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}
