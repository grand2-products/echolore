import { UserRole } from "@echolore/shared/contracts";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/auth.js";
import { authRoutes } from "./auth.js";

const {
  authenticatePasswordUserMock,
  exchangeGoogleIdTokenMock,
  getRequestIpMock,
  issueMobileTokenPairMock,
  isRateLimitedMock,
  refreshAccessTokenMock,
  registerPasswordUserMock,
  revokeRefreshTokenMock,
  verifyEmailRegistrationTokenMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  authenticatePasswordUserMock: vi.fn(),
  exchangeGoogleIdTokenMock: vi.fn(),
  getRequestIpMock: vi.fn(),
  issueMobileTokenPairMock: vi.fn(),
  isRateLimitedMock: vi.fn(),
  refreshAccessTokenMock: vi.fn(),
  registerPasswordUserMock: vi.fn(),
  revokeRefreshTokenMock: vi.fn(),
  verifyEmailRegistrationTokenMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("../lib/local-auth.js", () => ({
  authenticatePasswordUser: authenticatePasswordUserMock,
  exchangeGoogleIdToken: exchangeGoogleIdTokenMock,
  isRegistrationOpen: vi.fn().mockResolvedValue(true),
  issueMobileTokenPair: issueMobileTokenPairMock,
  refreshAccessToken: refreshAccessTokenMock,
  registerPasswordUser: registerPasswordUserMock,
  revokeRefreshToken: revokeRefreshTokenMock,
  verifyEmailRegistrationToken: verifyEmailRegistrationTokenMock,
}));

vi.mock("../lib/password-auth-guard.js", () => ({
  getRequestIp: getRequestIpMock,
  isRateLimited: isRateLimitedMock,
}));

vi.mock("../lib/audit.js", () => ({
  writeAuditLog: writeAuditLogMock,
}));

function createApp() {
  const app = new Hono<AppEnv>();
  app.route("/api/auth", authRoutes);
  return app;
}

describe("authRoutes", () => {
  beforeEach(() => {
    authenticatePasswordUserMock.mockReset();
    exchangeGoogleIdTokenMock.mockReset();
    getRequestIpMock.mockReset();
    issueMobileTokenPairMock.mockReset();
    isRateLimitedMock.mockReset();
    refreshAccessTokenMock.mockReset();
    registerPasswordUserMock.mockReset();
    revokeRefreshTokenMock.mockReset();
    verifyEmailRegistrationTokenMock.mockReset();
    writeAuditLogMock.mockReset();
    getRequestIpMock.mockReturnValue("127.0.0.1");
    isRateLimitedMock.mockResolvedValue(false);
  });

  it("creates a password registration request", async () => {
    registerPasswordUserMock.mockResolvedValue({ expiresAt: new Date("2026-03-12T00:30:00.000Z") });

    const response = await createApp().request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "member@example.com",
        name: "Member",
        password: "Password123",
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("verifies email and returns user info", async () => {
    verifyEmailRegistrationTokenMock.mockResolvedValue({
      id: "user_1",
      email: "member@example.com",
      name: "Member",
      role: UserRole.Member,
      avatarUrl: null,
    });

    const response = await createApp().request("http://localhost/api/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "verify-token" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      user: { id: "user_1", email: "member@example.com" },
      authMode: "password",
    });
  });

  it("issues mobile tokens", async () => {
    authenticatePasswordUserMock.mockResolvedValue({
      id: "user_2",
      email: "mobile@example.com",
      name: "Mobile",
      role: UserRole.Member,
      avatarUrl: null,
    });
    issueMobileTokenPairMock.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: new Date("2026-03-12T01:00:00.000Z"),
      user: {
        id: "user_2",
        email: "mobile@example.com",
        name: "Mobile",
        role: UserRole.Member,
        avatarUrl: null,
      },
      authMode: "password",
    });

    const response = await createApp().request("http://localhost/api/auth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "mobile@example.com",
        password: "secret",
        deviceName: "iPhone",
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: "2026-03-12T01:00:00.000Z",
      user: {
        id: "user_2",
        email: "mobile@example.com",
        name: "Mobile",
        role: UserRole.Member,
        avatarUrl: null,
      },
      authMode: "password",
    });
  });

  it("issues mobile tokens from a Google id token", async () => {
    exchangeGoogleIdTokenMock.mockResolvedValue({
      accessToken: "google-access-token",
      refreshToken: "google-refresh-token",
      expiresAt: new Date("2026-03-12T01:00:00.000Z"),
      user: {
        id: "user_3",
        email: "sso@example.com",
        name: "SSO User",
        role: UserRole.Member,
        avatarUrl: null,
      },
      authMode: "sso",
    });

    const response = await createApp().request("http://localhost/api/auth/token/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: "google-id-token", deviceName: "Pixel 9" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accessToken: "google-access-token",
      refreshToken: "google-refresh-token",
      expiresAt: "2026-03-12T01:00:00.000Z",
      user: {
        id: "user_3",
        email: "sso@example.com",
        name: "SSO User",
        role: UserRole.Member,
        avatarUrl: null,
      },
      authMode: "sso",
    });
  });

  it("refreshes mobile tokens through token refresh", async () => {
    refreshAccessTokenMock.mockResolvedValue({
      accessToken: "next-access",
      refreshToken: "next-refresh",
      expiresAt: new Date("2026-03-12T01:00:00.000Z"),
      user: {
        id: "user_2",
        email: "mobile@example.com",
        name: "Mobile",
        role: UserRole.Member,
        avatarUrl: null,
      },
      authMode: "password",
    });

    const response = await createApp().request("http://localhost/api/auth/token/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: "mobile-refresh-token" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      accessToken: "next-access",
      refreshToken: "next-refresh",
    });
    expect(refreshAccessTokenMock).toHaveBeenCalledWith({
      refreshToken: "mobile-refresh-token",
      clientType: "mobile",
      deviceName: null,
    });
  });

  it("rejects token/refresh without refreshToken in body", async () => {
    const response = await createApp().request("http://localhost/api/auth/token/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
  });

  it("rejects rate-limited mobile token requests", async () => {
    isRateLimitedMock.mockResolvedValue(true);

    const response = await createApp().request("http://localhost/api/auth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "secret" }),
    });

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "Too many sign-in attempts. Try again later.",
      code: "RATE_LIMITED",
    });
  });

  it("returns success on logout (no-op)", async () => {
    const response = await createApp().request("http://localhost/api/auth/logout", {
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
