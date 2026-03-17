import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { jsonError } from "../lib/api-error.js";
import { writeAuditLog } from "../lib/audit.js";
import type { AppEnv } from "../lib/auth.js";
import {
  authenticatePasswordUser,
  exchangeGoogleIdToken,
  isRegistrationOpen,
  issueMobileTokenPair,
  refreshAccessToken,
  registerPasswordUser,
  revokeRefreshToken,
  verifyEmailRegistrationToken,
} from "../lib/local-auth.js";
import { getRequestIp, isRateLimited } from "../lib/password-auth-guard.js";
import { ONE_HOUR_MS } from "../lib/time.js";

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1),
  password: z.string().min(8),
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
  refreshToken: z.string().min(1),
  deviceName: z.string().trim().min(1).max(120).optional(),
});

const tokenRevokeSchema = z.object({
  refreshToken: z.string().min(1),
});

export const authRoutes = new Hono<AppEnv>();

authRoutes.get("/registration-status", async (c) => {
  const open = await isRegistrationOpen();
  return c.json({ open });
});

authRoutes.post("/register", zValidator("json", registerSchema), async (c) => {
  const payload = c.req.valid("json");
  const ipAddress = getRequestIp(c.req.raw.headers);
  const rateLimited = await isRateLimited({
    action: "auth.password.register_attempt",
    email: payload.email,
    ipAddress,
    windowMs: ONE_HOUR_MS,
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
    const result = await registerPasswordUser(payload);
    await writeAuditLog({
      actorEmail: payload.email,
      action: "auth.password.register_attempt",
      resourceType: "auth",
      metadata: { authMode: "password", immediate: result.immediate },
      ipAddress,
      userAgent: c.req.header("user-agent") ?? null,
    });
    return c.json({ success: true as const, immediate: result.immediate, user: result.user }, 201);
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "";
    // Only expose known safe error messages to the client
    const KNOWN_MESSAGES: Record<string, { status: 400 | 403 | 409; message: string }> = {
      "Registration is closed": { status: 403, message: "Registration is closed" },
      "Password login is already configured for this email address": {
        status: 409,
        message: "Registration failed",
      },
      "Name is required": { status: 400, message: "Name is required" },
      "Email domain is not allowed": { status: 400, message: "Registration failed" },
    };
    const known = Object.entries(KNOWN_MESSAGES).find(([key]) => rawMessage.includes(key));
    const status = known ? known[1].status : 400;
    const clientMessage = known ? known[1].message : "Failed to register account";
    await writeAuditLog({
      actorEmail: payload.email,
      action: "auth.password.register_rejected",
      resourceType: "auth",
      metadata: { reason: known ? known[1].message : "unknown-error" },
      ipAddress,
      userAgent: c.req.header("user-agent") ?? null,
    });
    return jsonError(c, status, "REGISTER_REJECTED", clientMessage);
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

  // Email verified — return user info; user must manually sign in via Auth.js Credentials
  await writeAuditLog({
    actorUserId: user.id,
    actorEmail: user.email,
    action: "auth.password.verified",
    resourceType: "auth",
    resourceId: user.id,
    metadata: { authMode: "password" },
    ipAddress,
    userAgent: c.req.header("user-agent") ?? null,
  });

  return c.json({ user, authMode: "password" as const });
});

// Legacy browser login/google routes removed — Auth.js handles browser sign-in

authRoutes.post("/logout", async (c) => {
  // Browser logout is handled by Auth.js signout; this endpoint is a no-op.
  return c.json({ success: true });
});

// Mobile token routes — unchanged

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
      metadata: {
        reason: "invalid-password-credentials",
        authMode: "password",
        transport: "bearer",
      },
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
  const rateLimited = await isRateLimited({
    action: "auth.sso.google_token",
    ipAddress,
    windowMs: 15 * 60 * 1000,
    maxAttempts: 10,
  });

  if (rateLimited) {
    return jsonError(c, 429, "RATE_LIMITED", "Too many Google sign-in attempts. Try again later.");
  }

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
  } catch {
    await writeAuditLog({
      action: "auth.sso.mobile_token_rejected",
      resourceType: "auth",
      metadata: { provider: "google", reason: "google-id-token-invalid" },
      ipAddress,
      userAgent: c.req.header("user-agent") ?? null,
    });
    return jsonError(c, 401, "GOOGLE_TOKEN_INVALID", "Google sign-in failed");
  }
});

authRoutes.post("/token/refresh", zValidator("json", tokenRefreshSchema), async (c) => {
  const ipAddress = getRequestIp(c.req.raw.headers);
  const rateLimited = await isRateLimited({
    action: "auth.token.refresh_failed",
    ipAddress,
    windowMs: 15 * 60 * 1000,
    maxAttempts: 30,
  });

  if (rateLimited) {
    return jsonError(c, 429, "RATE_LIMITED", "Too many refresh attempts. Try again later.");
  }

  const { refreshToken, deviceName } = c.req.valid("json");
  const tokenSet = await refreshAccessToken({
    refreshToken,
    clientType: "mobile",
    deviceName: deviceName ?? null,
  });

  if (!tokenSet) {
    await writeAuditLog({
      action: "auth.token.refresh_failed",
      resourceType: "auth",
      metadata: { reason: "invalid-refresh-token" },
      ipAddress,
      userAgent: c.req.header("user-agent") ?? null,
    });
    return jsonError(c, 401, "INVALID_REFRESH_TOKEN", "Invalid refresh token");
  }

  return c.json({
    accessToken: tokenSet.accessToken,
    // refreshToken is null during grace period — client should keep its
    // existing refresh token from the previous (first) rotation response.
    ...(tokenSet.refreshToken ? { refreshToken: tokenSet.refreshToken } : {}),
    expiresAt: tokenSet.expiresAt.toISOString(),
    user: tokenSet.user,
    authMode: tokenSet.authMode,
  });
});

authRoutes.post("/token/revoke", zValidator("json", tokenRevokeSchema), async (c) => {
  const { refreshToken } = c.req.valid("json");
  await revokeRefreshToken(refreshToken);
  return c.json({ success: true });
});
