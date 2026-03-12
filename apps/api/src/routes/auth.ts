import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { jsonError } from "../lib/api-error.js";
import { writeAuditLog } from "../lib/audit.js";
import type { AppEnv } from "../lib/auth.js";
import { getRequestIp, isRateLimited } from "../lib/password-auth-guard.js";
import {
  authenticatePasswordUser,
  exchangeGoogleIdToken,
  clearPasswordSessionCookies,
  getRefreshTokenFromCookie,
  issueMobileTokenPair,
  issuePasswordWebSession,
  refreshAccessToken,
  registerPasswordUser,
  revokeRefreshToken,
  setPasswordSessionCookies,
  verifyEmailRegistrationToken,
} from "../lib/local-auth.js";

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

const tokenAuthSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceName: z.string().trim().min(1).max(120).optional(),
});

const googleTokenAuthSchema = z.object({
  idToken: z.string().min(1),
  deviceName: z.string().trim().min(1).max(120).optional(),
});

const tokenRefreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
  deviceName: z.string().trim().min(1).max(120).optional(),
});

const tokenRevokeSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/register", zValidator("json", registerSchema), async (c) => {
  const payload = c.req.valid("json");
  const ipAddress = getRequestIp(c.req.raw.headers);
  const rateLimited = await isRateLimited({
    action: "auth.password.register_attempt",
    email: payload.email,
    ipAddress,
    windowMs: 60 * 60 * 1000,
    maxAttempts: 3,
  });

  if (rateLimited) {
    await writeAuditLog({
      actorEmail: payload.email,
      action: "auth.password.register_rate_limited",
      resourceType: "auth",
      ipAddress,
      userAgent: c.req.header("user-agent") ?? null,
    });
    return jsonError(c, 429, "RATE_LIMITED", "Too many registration attempts. Try again later.");
  }

  try {
    await registerPasswordUser(payload);
    await writeAuditLog({
      actorEmail: payload.email,
      action: "auth.password.register_attempt",
      resourceType: "auth",
      metadata: { authMode: "password" },
      ipAddress,
      userAgent: c.req.header("user-agent") ?? null,
    });
    return c.json({ success: true as const }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to register account";
    const status = message.includes("already configured") ? 409 : 400;
    await writeAuditLog({
      actorEmail: payload.email,
      action: "auth.password.register_rejected",
      resourceType: "auth",
      metadata: { reason: message },
      ipAddress,
      userAgent: c.req.header("user-agent") ?? null,
    });
    return jsonError(c, status, "REGISTER_REJECTED", message);
  }
});

authRoutes.post("/verify-email", zValidator("json", verifyEmailSchema), async (c) => {
  const { token } = c.req.valid("json");
  const ipAddress = getRequestIp(c.req.raw.headers);
  const rateLimited = await isRateLimited({
    action: "auth.password.verify_rejected",
    ipAddress,
    windowMs: 15 * 60 * 1000,
    maxAttempts: 10,
  });

  if (rateLimited) {
    return jsonError(c, 429, "RATE_LIMITED", "Too many verification attempts. Try again later.");
  }

  const user = await verifyEmailRegistrationToken(token);
  if (!user) {
    await writeAuditLog({
      action: "auth.password.verify_rejected",
      resourceType: "auth",
      metadata: { reason: "invalid-or-expired-token" },
      ipAddress,
      userAgent: c.req.header("user-agent") ?? null,
    });
    return jsonError(c, 400, "INVALID_TOKEN", "Invalid or expired verification token");
  }

  await issuePasswordWebSession(c, user.id);
  await writeAuditLog({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "auth.password.verified",
    resourceType: "auth",
    resourceId: user.id,
    metadata: { authMode: "password", transport: "cookie" },
    ipAddress,
    userAgent: c.req.header("user-agent") ?? null,
  });

  return c.json({ user, authMode: "password" as const });
});

authRoutes.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json");
  const ipAddress = getRequestIp(c.req.raw.headers);
  const rateLimited = await isRateLimited({
    action: "auth.password.login_failed",
    email,
    ipAddress,
    windowMs: 15 * 60 * 1000,
    maxAttempts: 5,
  });

  if (rateLimited) {
    await writeAuditLog({
      actorEmail: email,
      action: "auth.password.login_rate_limited",
      resourceType: "auth",
      ipAddress,
      userAgent: c.req.header("user-agent") ?? null,
    });
    return jsonError(c, 429, "RATE_LIMITED", "Too many sign-in attempts. Try again later.");
  }

  const user = await authenticatePasswordUser(email, password);
  if (!user) {
    await writeAuditLog({
      actorEmail: email,
      action: "auth.password.login_failed",
      resourceType: "auth",
      metadata: { reason: "invalid-password-credentials", authMode: "password", transport: "cookie" },
      ipAddress,
      userAgent: c.req.header("user-agent") ?? null,
    });
    return jsonError(c, 401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  await issuePasswordWebSession(c, user.id);
  await writeAuditLog({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "auth.password.login",
    resourceType: "auth",
    resourceId: user.id,
    metadata: { transport: "cookie" },
    ipAddress,
    userAgent: c.req.header("user-agent") ?? null,
  });
  return c.json({ user, authMode: "password" as const });
});

authRoutes.post("/logout", async (c) => {
  await revokeRefreshToken(getRefreshTokenFromCookie(c));
  clearPasswordSessionCookies(c);
  return c.json({ success: true });
});

authRoutes.post("/token", zValidator("json", tokenAuthSchema), async (c) => {
  const { email, password, deviceName } = c.req.valid("json");
  const ipAddress = getRequestIp(c.req.raw.headers);
  const rateLimited = await isRateLimited({
    action: "auth.password.login_failed",
    email,
    ipAddress,
    windowMs: 15 * 60 * 1000,
    maxAttempts: 5,
  });

  if (rateLimited) {
    return jsonError(c, 429, "RATE_LIMITED", "Too many sign-in attempts. Try again later.");
  }

  const user = await authenticatePasswordUser(email, password);
  if (!user) {
    await writeAuditLog({
      actorEmail: email,
      action: "auth.password.login_failed",
      resourceType: "auth",
      metadata: { reason: "invalid-password-credentials", authMode: "password", transport: "bearer" },
      ipAddress,
      userAgent: c.req.header("user-agent") ?? null,
    });
    return jsonError(c, 401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  const tokenSet = await issueMobileTokenPair({ userId: user.id, deviceName: deviceName ?? null });
  await writeAuditLog({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "auth.password.mobile_token_issued",
    resourceType: "auth",
    resourceId: user.id,
    metadata: { transport: "bearer", deviceName: deviceName ?? null },
    ipAddress,
    userAgent: c.req.header("user-agent") ?? null,
  });

  return c.json({
    accessToken: tokenSet.accessToken,
    refreshToken: tokenSet.refreshToken,
    expiresAt: tokenSet.expiresAt.toISOString(),
    user: tokenSet.user,
    authMode: tokenSet.authMode,
  });
});

authRoutes.post("/token/google", zValidator("json", googleTokenAuthSchema), async (c) => {
  const { idToken, deviceName } = c.req.valid("json");
  const ipAddress = getRequestIp(c.req.raw.headers);

  try {
    const tokenSet = await exchangeGoogleIdToken({ idToken, deviceName: deviceName ?? null });
    await writeAuditLog({
      actorUserId: tokenSet.user.id,
      actorEmail: tokenSet.user.email,
      action: "auth.sso.mobile_token_issued",
      resourceType: "auth",
      resourceId: tokenSet.user.id,
      metadata: { transport: "bearer", provider: "google", deviceName: deviceName ?? null },
      ipAddress,
      userAgent: c.req.header("user-agent") ?? null,
    });

    return c.json({
      accessToken: tokenSet.accessToken,
      refreshToken: tokenSet.refreshToken,
      expiresAt: tokenSet.expiresAt.toISOString(),
      user: tokenSet.user,
      authMode: tokenSet.authMode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google sign-in failed";
    await writeAuditLog({
      action: "auth.sso.mobile_token_rejected",
      resourceType: "auth",
      metadata: { provider: "google", reason: message },
      ipAddress,
      userAgent: c.req.header("user-agent") ?? null,
    });
    return jsonError(c, 401, "GOOGLE_TOKEN_INVALID", message);
  }
});

authRoutes.post("/token/refresh", zValidator("json", tokenRefreshSchema), async (c) => {
  const { refreshToken, deviceName } = c.req.valid("json");
  const isMobile = Boolean(refreshToken);
  const tokenSet = await refreshAccessToken({
    refreshToken: refreshToken ?? getRefreshTokenFromCookie(c) ?? "",
    clientType: isMobile ? "mobile" : "web",
    deviceName: deviceName ?? null,
  });

  if (!tokenSet) {
    return jsonError(c, 401, "INVALID_REFRESH_TOKEN", "Invalid refresh token");
  }

  if (!isMobile) {
    clearPasswordSessionCookies(c);
    setPasswordSessionCookies(c, tokenSet);
  }

  return c.json({
    accessToken: tokenSet.accessToken,
    refreshToken: tokenSet.refreshToken,
    expiresAt: tokenSet.expiresAt.toISOString(),
    user: tokenSet.user,
    authMode: tokenSet.authMode,
  });
});

authRoutes.post("/token/revoke", zValidator("json", tokenRevokeSchema), async (c) => {
  const { refreshToken } = c.req.valid("json");
  await revokeRefreshToken(refreshToken ?? getRefreshTokenFromCookie(c));
  if (!refreshToken) {
    clearPasswordSessionCookies(c);
  }
  return c.json({ success: true });
});
