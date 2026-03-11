import type { Context, MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { writeAuditLog } from "./audit.js";

const ALLOWED_DOMAIN = (process.env.AUTH_ALLOWED_DOMAIN || "grand2-products.com").toLowerCase();
const AUTH_BYPASS = process.env.AUTH_BYPASS === "true";
const AUTH_VERIFY_URL = process.env.AUTH_VERIFY_URL || "http://oauth2-proxy:4180/oauth2/auth";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
};

export type AppEnv = {
  Variables: {
    user: SessionUser;
  };
};

const getHeader = (c: Context, keys: string[]): string | null => {
  for (const key of keys) {
    const value = c.req.header(key);
    if (value && value.trim()) return value.trim();
  }
  return null;
};

const getClientIp = (c: Context): string | null => getHeader(c, ["x-forwarded-for", "x-real-ip"]);

const verifySessionWithProxy = async (
  c: Context,
): Promise<{ email: string; name: string } | null> => {
  const cookie = c.req.header("cookie");
  if (!cookie) return null;

  try {
    const verifyResponse = await fetch(AUTH_VERIFY_URL, {
      method: "GET",
      headers: {
        cookie,
        "x-forwarded-uri": c.req.path,
        "x-forwarded-method": c.req.method,
      },
    });

    if (!verifyResponse.ok) {
      return null;
    }

    const email = verifyResponse.headers.get("x-auth-request-email")?.trim() ?? "";
    const name = verifyResponse.headers.get("x-auth-request-user")?.trim() ?? "Unknown";
    if (!email) return null;

    return { email, name };
  } catch (error) {
    console.error("Auth proxy verification failed:", error);
    return null;
  }
};

const parseUserFromHeaders = async (c: Context): Promise<SessionUser | null> => {
  const verifiedUser = await verifySessionWithProxy(c);
  if (!verifiedUser) return null;

  const email = verifiedUser.email;
  const name = verifiedUser.name;

  const [, domain = ""] = email.toLowerCase().split("@");
  if (domain !== ALLOWED_DOMAIN) return null;

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    return {
      id: existing.id,
      email: existing.email,
      name: existing.name,
      role: existing.role === "admin" ? "admin" : "member",
    };
  }

  const now = new Date();
  const [created] = await db
    .insert(users)
    .values({
      id: `user_${crypto.randomUUID()}`,
      email,
      name,
      role: "member",
      avatarUrl: null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) return null;
  return { id: created.id, email: created.email, name: created.name, role: "member" };
};

export const authGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (AUTH_BYPASS) {
    c.set("user", {
      id: "dev_user",
      email: `dev@${ALLOWED_DOMAIN}`,
      name: "Dev User",
      role: "admin",
    });
    await next();
    return;
  }

  const sessionUser = await parseUserFromHeaders(c);
  if (!sessionUser) {
    await writeAuditLog({
      actorEmail: getHeader(c, ["x-auth-request-email", "x-forwarded-email"]),
      action: "auth.rejected",
      resourceType: "auth",
      metadata: { reason: "missing-or-invalid-domain", allowedDomain: ALLOWED_DOMAIN },
      ipAddress: getClientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
    });
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("user", sessionUser);
  await writeAuditLog({
    actorUserId: sessionUser.id,
    actorEmail: sessionUser.email,
    action: "auth.authenticated",
    resourceType: "auth",
    resourceId: sessionUser.id,
    ipAddress: getClientIp(c),
    userAgent: c.req.header("user-agent") ?? null,
  });
  await next();
};

export const requireRole = (role: "admin" | "member"): MiddlewareHandler<AppEnv> => async (c, next) => {
  const sessionUser = c.get("user");
  if (!sessionUser) return c.json({ error: "Unauthorized" }, 401);

  if (role === "admin" && sessionUser.role !== "admin") {
    await writeAuditLog({
      actorUserId: sessionUser.id,
      actorEmail: sessionUser.email,
      action: "authz.denied",
      resourceType: "role",
      metadata: { requiredRole: role, actualRole: sessionUser.role, path: c.req.path },
      ipAddress: getClientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
    });
    return c.json({ error: "Forbidden" }, 403);
  }

  await next();
};
