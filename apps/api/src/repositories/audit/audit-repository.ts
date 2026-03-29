import { sql } from "kysely";
import { db } from "../../db/index.js";

export async function insertAuditLog(payload: {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}): Promise<void> {
  await db
    .insertInto("audit_logs")
    .values({
      id: payload.id,
      actorUserId: payload.actorUserId,
      actorEmail: payload.actorEmail,
      action: payload.action,
      resourceType: payload.resourceType,
      resourceId: payload.resourceId,
      metadata: payload.metadata ?? null,
      ipAddress: payload.ipAddress,
      userAgent: payload.userAgent,
      createdAt: payload.createdAt,
    })
    .execute();
}

export async function countAuditLogsByActionAndIp(
  action: string,
  ipAddress: string,
  since: Date
): Promise<number> {
  const result = await db
    .selectFrom("audit_logs")
    .select(sql<number>`count(*)`.as("count"))
    .where("action", "=", action)
    .where("createdAt", ">", since)
    .where("ipAddress", "=", ipAddress)
    .executeTakeFirst();
  return Number(result?.count ?? 0);
}

export async function countAuditLogsByActionAndIdentity(
  action: string,
  since: Date,
  identity: { email?: string | null; ipAddress?: string | null }
): Promise<number> {
  const identityConditions: Array<{
    col: "actorEmail" | "ipAddress";
    val: string;
  }> = [];
  if (identity.email) identityConditions.push({ col: "actorEmail", val: identity.email });
  if (identity.ipAddress) identityConditions.push({ col: "ipAddress", val: identity.ipAddress });

  if (identityConditions.length === 0) {
    return 0;
  }

  const result = await db
    .selectFrom("audit_logs")
    .select(sql<number>`count(*)`.as("count"))
    .where("action", "=", action)
    .where("createdAt", ">", since)
    .where((eb) => eb.or(identityConditions.map((c) => eb(c.col, "=", c.val))))
    .executeTakeFirst();

  return Number(result?.count ?? 0);
}
