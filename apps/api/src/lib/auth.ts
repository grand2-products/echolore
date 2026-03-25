import { getToken } from "@auth/core/jwt";
import { UserRole } from "@echolore/shared/contracts";
import type { Context, MiddlewareHandler } from "hono";
import { getUserById } from "../repositories/user/user-repository.js";
import { resolveAllowedDomain } from "../services/admin/auth-settings-service.js";
import { jsonError } from "./api-error.js";
import { writeAuditLog } from "./audit.js";
import { resolveAccessTokenSession } from "./local-auth.js";

// Cache of user IDs confirmed to exist in DB. Avoids a DB query on every request.
const verifiedUserIds = new Set<string>();

/** Remove a user from the verified-user cache so the next request re-checks the DB. */
export function invalidateVerifiedUser(userId: string) {
  verifiedUserIds.delete(userId);
}

const AUTH_SECRET = process.env.AUTH_SECRET || process.env.AUTH_SESSION_SECRET;
if (!AUTH_SECRET) {
  throw new Error("AUTH_SECRET (or AUTH_SESSION_SECRET) must be set");
}
if (!process.env.AUTH_SECRET && process.env.AUTH_SESSION_SECRET) {
  console.warn(
    "[auth] WARNING: Using deprecated AUTH_SESSION_SECRET. Please set AUTH_SECRET instead."
  );
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string | null;
};

export type SessionAuthMode = "password" | "sso";

export type AppEnv = {
  Variables: {
    user: SessionUser;
    authMode: SessionAuthMode;
    authTransport: "bearer" | "authjs";
  };
};

const getHeader = (c: Context, keys: string[]): string | null => {
  for (const key of keys) {
    const value = c.req.header(key);
    if (value?.trim()) return value.trim();
  }
  return null;
};

const getClientIp = (c: Context): string | null => getHeader(c, ["x-forwarded-for", "x-real-ip"]);
const getBearerToken = (c: Context): string | null => {
  const authorization = c.req.header("authorization");
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
};

export async function resolveAuthjsSession(
  c: Context
): Promise<{ user: SessionUser; authMode: SessionAuthMode } | null> {
  try {
    const token = await getToken({
      req: new Request(c.req.url, { headers: c.req.raw.headers }),
      secret: AUTH_SECRET,
      secureCookie: process.env.NODE_ENV === "production",
      salt:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token"
          : "authjs.session-token",
    });
    if (!token) return null;

    const userId = token.userId as string | undefined;
    const email = token.email as string | undefined;
    const name = token.name as string | undefined;
    const role = token.role as string | undefined;
    const avatarUrl = token.avatarUrl as string | null | undefined;
    const authMode = token.authMode as string | undefined;

    if (!userId || !email) return null;

    return {
      user: {
        id: userId,
        email,
        name: name || email.split("@")[0] || "User",
        role: role === UserRole.Admin ? UserRole.Admin : UserRole.Member,
        avatarUrl: avatarUrl ?? null,
      },
      authMode: authMode === "password" ? "password" : "sso",
    };
  } catch {
    return null;
  }
}

export const authGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  // 1. Bearer token (mobile)
  const bearerToken = getBearerToken(c);
  const tokenSession = await resolveAccessTokenSession({ accessToken: bearerToken });
  if (tokenSession) {
    c.set("user", tokenSession.user);
    c.set("authMode", tokenSession.authMode);
    c.set("authTransport", "bearer");
    await writeAuditLog({
      actorUserId: tokenSession.user.id,
      actorEmail: tokenSession.user.email,
      action: "auth.authenticated",
      resourceType: "auth",
      resourceId: tokenSession.user.id,
      metadata: { authMode: tokenSession.authMode, transport: "bearer" },
      ipAddress: getClientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
    });
    await next();
    return;
  }

  // 2. Auth.js JWT session (browser)
  const authjsResult = await resolveAuthjsSession(c);
  if (authjsResult) {
    // Verify user still exists in DB (cached after first check)
    if (!verifiedUserIds.has(authjsResult.user.id)) {
      const dbUser = await getUserById(authjsResult.user.id);
      if (!dbUser) {
        return jsonError(c, 401, "SESSION_INVALID", "User no longer exists");
      }
      if (dbUser.suspendedAt || dbUser.deletedAt) {
        return jsonError(c, 403, "ACCOUNT_SUSPENDED", "Account is suspended or deleted");
      }
      verifiedUserIds.add(authjsResult.user.id);
    }
    c.set("user", authjsResult.user);
    c.set("authMode", authjsResult.authMode);
    c.set("authTransport", "authjs");
    await writeAuditLog({
      actorUserId: authjsResult.user.id,
      actorEmail: authjsResult.user.email,
      action: "auth.authenticated",
      resourceType: "auth",
      resourceId: authjsResult.user.id,
      metadata: { authMode: authjsResult.authMode, transport: "authjs" },
      ipAddress: getClientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
    });
    await next();
    return;
  }

  // 3. Unauthorized
  await writeAuditLog({
    actorEmail: null,
    action: "auth.rejected",
    resourceType: "auth",
    metadata: { reason: "no-valid-session", allowedDomain: await resolveAllowedDomain() },
    ipAddress: getClientIp(c),
    userAgent: c.req.header("user-agent") ?? null,
  });
  return jsonError(c, 401, "UNAUTHORIZED", "Unauthorized");
};

const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.Member]: 0,
  [UserRole.Admin]: 1,
};

export const requireRole =
  (role: UserRole): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    const sessionUser = c.get("user");
    if (!sessionUser) return jsonError(c, 401, "UNAUTHORIZED", "Unauthorized");

    const requiredLevel = ROLE_HIERARCHY[role] ?? 0;
    const actualLevel = ROLE_HIERARCHY[sessionUser.role] ?? 0;

    if (actualLevel < requiredLevel) {
      await writeAuditLog({
        actorUserId: sessionUser.id,
        actorEmail: sessionUser.email,
        action: "authz.denied",
        resourceType: "role",
        metadata: { requiredRole: role, actualRole: sessionUser.role, path: c.req.path },
        ipAddress: getClientIp(c),
        userAgent: c.req.header("user-agent") ?? null,
      });
      return jsonError(c, 403, "FORBIDDEN", "Forbidden");
    }

    await next();
  };
