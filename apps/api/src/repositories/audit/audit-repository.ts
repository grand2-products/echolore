import { and, eq, gt, or, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { auditLogs } from "../../db/schema.js";

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
  await db.insert(auditLogs).values(payload);
}

export async function countAuditLogsByActionAndIp(
  action: string,
  ipAddress: string,
  since: Date
): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.action, action),
        gt(auditLogs.createdAt, since),
        eq(auditLogs.ipAddress, ipAddress)
      )
    );
  return Number(result?.count ?? 0);
}

export async function countAuditLogsByActionAndIdentity(
  action: string,
  since: Date,
  identity: { email?: string | null; ipAddress?: string | null }
): Promise<number> {
  const conditions = [eq(auditLogs.action, action), gt(auditLogs.createdAt, since)];

  const identityConditions = [];
  if (identity.email) identityConditions.push(eq(auditLogs.actorEmail, identity.email));
  if (identity.ipAddress) identityConditions.push(eq(auditLogs.ipAddress, identity.ipAddress));

  if (identityConditions.length === 0) {
    return 0;
  }

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogs)
    .where(and(...conditions, or(...identityConditions)));

  return Number(result?.count ?? 0);
}
