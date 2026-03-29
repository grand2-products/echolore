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
      actor_user_id: payload.actorUserId,
      actor_email: payload.actorEmail,
      action: payload.action,
      resource_type: payload.resourceType,
      resource_id: payload.resourceId,
      metadata: payload.metadata,
      ip_address: payload.ipAddress,
      user_agent: payload.userAgent,
      created_at: payload.createdAt,
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
    .where("created_at", ">", since)
    .where("ip_address", "=", ipAddress)
    .executeTakeFirst();
  return Number(result?.count ?? 0);
}

export async function countAuditLogsByActionAndIdentity(
  action: string,
  since: Date,
  identity: { email?: string | null; ipAddress?: string | null }
): Promise<number> {
  const identityConditions: Array<{
    col: "actor_email" | "ip_address";
    val: string;
  }> = [];
  if (identity.email) identityConditions.push({ col: "actor_email", val: identity.email });
  if (identity.ipAddress) identityConditions.push({ col: "ip_address", val: identity.ipAddress });

  if (identityConditions.length === 0) {
    return 0;
  }

  const result = await db
    .selectFrom("audit_logs")
    .select(sql<number>`count(*)`.as("count"))
    .where("action", "=", action)
    .where("created_at", ">", since)
    .where((eb) => eb.or(identityConditions.map((c) => eb(c.col, "=", c.val))))
    .executeTakeFirst();

  return Number(result?.count ?? 0);
}
