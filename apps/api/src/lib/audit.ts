import type { Context } from "hono";
import { insertAuditLog } from "../repositories/audit/audit-repository.js";
import type { AppEnv } from "./auth.js";

export function extractRequestMeta(c: Context<AppEnv>) {
  return {
    ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
  };
}

export function auditAction(
  c: Context<AppEnv>,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata?: Record<string, unknown>
) {
  const user = c.get("user");
  return writeAuditLog({
    actorUserId: user?.id ?? null,
    actorEmail: user?.email ?? null,
    action,
    resourceType,
    resourceId,
    metadata: metadata ?? {},
    ...extractRequestMeta(c),
  });
}

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
    await insertAuditLog(payload);
  } catch (error) {
    // Keep audit logging best-effort; do not break request flow.
    console.error("Failed to persist audit log:", error);
    console.info("[AUDIT_FALLBACK]", JSON.stringify({ ...payload, createdAt: now.toISOString() }));
  }
}
