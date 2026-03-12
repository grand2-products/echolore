import type { Context, MiddlewareHandler } from "hono";
import { writeAuditLog } from "./audit.js";
import { getAccessTokenFromCookie, reconcileGoogleIdentity, resolveAccessTokenSession } from "./local-auth.js";
import { isSameOriginRequest } from "./password-auth-guard.js";

const ALLOWED_DOMAIN = (process.env.AUTH_ALLOWED_DOMAIN || "grand2-products.com").toLowerCase();
const AUTH_BYPASS = process.env.AUTH_BYPASS === "true";
const AUTH_VERIFY_URL = process.env.AUTH_VERIFY_URL || "http://oauth2-proxy:4180/oauth2/auth";
const PASSWORD_AUTH_ALLOWED_ORIGINS = [
  process.env.APP_BASE_URL,
  process.env.CORS_ORIGIN,
  process.env.NEXT_PUBLIC_API_URL,
].filter((value): value is string => Boolean(value));

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "member";
  avatarUrl?: string | null;
};

export type SessionAuthMode = "password" | "sso" | "bypass";

export type AppEnv = {
  Variables: {
    user: SessionUser;
    authMode: SessionAuthMode;
    authTransport: "cookie" | "bearer" | "proxy" | "bypass";
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
const getBearerToken = (c: Context): string | null => {
  const authorization = c.req.header("authorization");
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
};

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

  return reconcileGoogleIdentity({ email, name });
};

export const authGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (AUTH_BYPASS) {
    c.set("user", {
      id: "dev_user",
      email: `dev@${ALLOWED_DOMAIN}`,
      name: "Dev User",
      role: "admin",
      avatarUrl: null,
    });
    c.set("authMode", "bypass");
    c.set("authTransport", "bypass");
    await next();
    return;
  }

  const bearerToken = getBearerToken(c);
  const accessToken = bearerToken ?? getAccessTokenFromCookie(c);
  const tokenSession = await resolveAccessTokenSession({ accessToken });
  if (tokenSession) {
    c.set("user", tokenSession.user);
    c.set("authMode", tokenSession.authMode);
    c.set("authTransport", bearerToken ? "bearer" : "cookie");
    await writeAuditLog({
      actorUserId: tokenSession.user.id,
      actorEmail: tokenSession.user.email,
      action: "auth.authenticated",
      resourceType: "auth",
      resourceId: tokenSession.user.id,
      metadata: { authMode: tokenSession.authMode, transport: bearerToken ? "bearer" : "cookie" },
      ipAddress: getClientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
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
  c.set("authMode", "sso");
  c.set("authTransport", "proxy");
  await writeAuditLog({
    actorUserId: sessionUser.id,
    actorEmail: sessionUser.email,
    action: "auth.authenticated",
    resourceType: "auth",
    resourceId: sessionUser.id,
    metadata: { authMode: "sso" },
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

export const passwordCsrfGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  const method = c.req.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    await next();
    return;
  }

  const authMode = c.get("authMode");
  const authTransport = c.get("authTransport");
  if (authMode !== "password" || authTransport !== "cookie") {
    await next();
    return;
  }

  const isAllowed = isSameOriginRequest({
    origin: c.req.header("origin"),
    referer: c.req.header("referer"),
    allowedOrigins: PASSWORD_AUTH_ALLOWED_ORIGINS,
  });

  if (!isAllowed) {
    const sessionUser = c.get("user");
    await writeAuditLog({
      actorUserId: sessionUser?.id ?? null,
      actorEmail: sessionUser?.email ?? null,
      action: "auth.password.csrf_rejected",
      resourceType: "auth",
      resourceId: sessionUser?.id ?? null,
      metadata: { path: c.req.path, method },
      ipAddress: getClientIp(c),
      userAgent: c.req.header("user-agent") ?? null,
    });
    return c.json({ error: "Forbidden" }, 403);
  }

  await next();
};
