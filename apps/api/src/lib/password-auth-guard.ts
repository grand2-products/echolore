import { and, eq, gt, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { auditLogs } from "../db/schema.js";

/**
 * Global per-IP rate limit to prevent distributed email enumeration.
 * Applies regardless of which email is used.
 */
const GLOBAL_IP_RATE_LIMIT = { windowMinutes: 15, maxAttempts: 20 };

type RateLimitInput = {
  action: string;
  email?: string | null;
  ipAddress?: string | null;
  windowMs: number;
  maxAttempts: number;
};

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || null;
}

export async function isRateLimited(input: RateLimitInput) {
  const ipAddress = input.ipAddress?.trim() || null;

  // Global per-IP check: block if this IP has too many attempts across ALL emails
  if (ipAddress) {
    const globalSince = new Date(
      Date.now() - GLOBAL_IP_RATE_LIMIT.windowMinutes * 60_000,
    );
    const [globalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, input.action),
          gt(auditLogs.createdAt, globalSince),
          eq(auditLogs.ipAddress, ipAddress),
        ),
      );
    if (Number(globalResult?.count ?? 0) >= GLOBAL_IP_RATE_LIMIT.maxAttempts) {
      return true;
    }
  }

  // Per-email+IP check (existing logic)
  const since = new Date(Date.now() - input.windowMs);
  const conditions = [
    eq(auditLogs.action, input.action),
    gt(auditLogs.createdAt, since),
  ];

  const email = normalizeEmail(input.email);

  const identityConditions = [];
  if (email) identityConditions.push(eq(auditLogs.actorEmail, email));
  if (ipAddress) identityConditions.push(eq(auditLogs.ipAddress, ipAddress));

  if (identityConditions.length === 0) {
    return false;
  }

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogs)
    .where(and(...conditions, or(...identityConditions)));

  return Number(result?.count ?? 0) >= input.maxAttempts;
}

/**
 * Extract the client IP from proxy headers.
 * When behind a reverse proxy (e.g. Traefik, nginx), x-forwarded-for may contain
 * a comma-separated list of IPs. We take only the first (leftmost) entry,
 * which is the original client IP set by the outermost trusted proxy.
 * Ensure your reverse proxy overwrites (not appends) x-forwarded-for
 * to prevent IP spoofing by untrusted clients.
 */
export function getRequestIp(headers: { get(name: string): string | null | undefined }) {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const firstIp = xff.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }
  return headers.get("x-real-ip") ?? null;
}

