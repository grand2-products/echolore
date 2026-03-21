import {
  countAuditLogsByActionAndIdentity,
  countAuditLogsByActionAndIp,
} from "../repositories/audit/audit-repository.js";

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
    const globalSince = new Date(Date.now() - GLOBAL_IP_RATE_LIMIT.windowMinutes * 60_000);
    const count = await countAuditLogsByActionAndIp(input.action, ipAddress, globalSince);
    if (count >= GLOBAL_IP_RATE_LIMIT.maxAttempts) {
      return true;
    }
  }

  // Per-email+IP check
  const email = normalizeEmail(input.email);
  if (!email && !ipAddress) {
    return false;
  }

  const since = new Date(Date.now() - input.windowMs);
  const count = await countAuditLogsByActionAndIdentity(input.action, since, {
    email,
    ipAddress,
  });

  return count >= input.maxAttempts;
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
