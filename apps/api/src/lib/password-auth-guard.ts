import { and, eq, gt, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { auditLogs } from "../db/schema.js";

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
  const since = new Date(Date.now() - input.windowMs);
  const conditions = [
    eq(auditLogs.action, input.action),
    gt(auditLogs.createdAt, since),
  ];

  const email = normalizeEmail(input.email);
  const ipAddress = input.ipAddress?.trim() || null;

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

export function getRequestIp(headers: { get(name: string): string | null | undefined }) {
  return headers.get("x-forwarded-for") ?? headers.get("x-real-ip") ?? null;
}

export function isSameOriginRequest(input: {
  origin?: string | null;
  referer?: string | null;
  allowedOrigins: string[];
}) {
  const allowed = new Set(
    input.allowedOrigins
      .map((origin) => {
        try {
          return new URL(origin).origin;
        } catch {
          return null;
        }
      })
      .filter((value): value is string => Boolean(value))
  );

  const candidates = [input.origin, input.referer]
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return null;
      }
    })
    .filter((value): value is string => Boolean(value));

  if (candidates.length === 0) {
    return false;
  }

  return candidates.some((origin) => allowed.has(origin));
}
