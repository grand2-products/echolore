import { db } from "../db/index.js";
import { auditLogs } from "../db/schema.js";

export interface AuditLogInput {
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  const now = new Date();
  const payload = {
    id: `audit_${crypto.randomUUID()}`,
    actorUserId: input.actorUserId ?? null,
    actorEmail: input.actorEmail ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    metadata: input.metadata ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    createdAt: now,
  };

  try {
    await db.insert(auditLogs).values(payload);
  } catch (error) {
    // Keep audit logging best-effort; do not break request flow.
    console.error("Failed to persist audit log:", error);
    console.info("[AUDIT_FALLBACK]", JSON.stringify({ ...payload, createdAt: now.toISOString() }));
  }
}
