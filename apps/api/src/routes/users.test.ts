import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authGuard, type AppEnv } from "../lib/auth.js";
import { usersRoutes } from "./users.js";

const {
  clearPasswordSessionCookiesMock,
  getAccessTokenFromCookieMock,
  getRefreshTokenFromCookieMock,
  getUserByIdMock,
  listAuthSessionsForUserMock,
  reconcileGoogleIdentityMock,
  resolveAccessTokenSessionMock,
  revokeAuthSessionByIdMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  clearPasswordSessionCookiesMock: vi.fn(),
  getAccessTokenFromCookieMock: vi.fn(),
  getRefreshTokenFromCookieMock: vi.fn(),
  getUserByIdMock: vi.fn(),
  listAuthSessionsForUserMock: vi.fn(),
  reconcileGoogleIdentityMock: vi.fn(),
  resolveAccessTokenSessionMock: vi.fn(),
  revokeAuthSessionByIdMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("../lib/local-auth.js", () => ({
  clearPasswordSessionCookies: clearPasswordSessionCookiesMock,
  getAccessTokenFromCookie: getAccessTokenFromCookieMock,
  getRefreshTokenFromCookie: getRefreshTokenFromCookieMock,
  listAuthSessionsForUser: listAuthSessionsForUserMock,
  reconcileGoogleIdentity: reconcileGoogleIdentityMock,
  resolveAccessTokenSession: resolveAccessTokenSessionMock,
  revokeAuthSessionById: revokeAuthSessionByIdMock,
}));

vi.mock("../repositories/user/user-repository.js", () => ({
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserById: getUserByIdMock,
  listUsers: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock("../policies/authorization-policy.js", () => ({
  authorizeAdminResource: vi.fn(),
  authorizeUserResource: vi.fn(),
}));

vi.mock("../lib/audit.js", () => ({
  writeAuditLog: writeAuditLogMock,
}));

function createApp() {
  const app = new Hono<AppEnv>();
  app.use("/api/*", authGuard);
  app.route("/api/users", usersRoutes);
  return app;
}

describe("usersRoutes", () => {
  beforeEach(() => {
    clearPasswordSessionCookiesMock.mockReset();
    getAccessTokenFromCookieMock.mockReset();
    getRefreshTokenFromCookieMock.mockReset();
    getUserByIdMock.mockReset();
    listAuthSessionsForUserMock.mockReset();
    reconcileGoogleIdentityMock.mockReset();
    resolveAccessTokenSessionMock.mockReset();
    revokeAuthSessionByIdMock.mockReset();
    writeAuditLogMock.mockReset();
  });

  it("serves /api/users/me through bearer auth", async () => {
    resolveAccessTokenSessionMock.mockResolvedValue({
      user: {
        id: "user_1",
        email: "member@example.com",
        name: "Member",
        role: "member",
        avatarUrl: null,
      },
      authMode: "password",
    });
    getUserByIdMock.mockResolvedValue({
      id: "user_1",
      email: "member@example.com",
      name: "Member",
      avatarUrl: null,
      role: "member",
      emailVerifiedAt: new Date("2026-03-12T00:00:00.000Z"),
      tokenVersion: 1,
      createdAt: new Date("2026-03-12T00:00:00.000Z"),
      updatedAt: new Date("2026-03-12T00:00:00.000Z"),
    });

    const response = await createApp().request("http://localhost/api/users/me", {
      headers: {
        authorization: "Bearer access-token",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: {
        id: "user_1",
        email: "member@example.com",
        name: "Member",
        avatarUrl: null,
        role: "member",
        emailVerifiedAt: "2026-03-12T00:00:00.000Z",
        tokenVersion: 1,
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
      },
    });
  });

  it("lists current user auth sessions", async () => {
    resolveAccessTokenSessionMock.mockResolvedValue({
      user: {
        id: "user_1",
        email: "member@example.com",
        name: "Member",
        role: "member",
        avatarUrl: null,
      },
      authMode: "password",
    });
    getRefreshTokenFromCookieMock.mockReturnValue("cookie-refresh");
    listAuthSessionsForUserMock.mockResolvedValue([
      {
        id: "rt_1",
        clientType: "web",
        authMode: "password",
        deviceName: "Chrome on Windows",
        createdAt: new Date("2026-03-12T00:00:00.000Z"),
        lastSeenAt: new Date("2026-03-12T00:10:00.000Z"),
        expiresAt: new Date("2026-04-11T00:00:00.000Z"),
        current: true,
      },
    ]);

    const response = await createApp().request("http://localhost/api/users/me/sessions", {
      headers: {
        authorization: "Bearer access-token",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sessions: [
        {
          id: "rt_1",
          clientType: "web",
          authMode: "password",
          deviceName: "Chrome on Windows",
          createdAt: "2026-03-12T00:00:00.000Z",
          lastSeenAt: "2026-03-12T00:10:00.000Z",
          expiresAt: "2026-04-11T00:00:00.000Z",
          current: true,
        },
      ],
    });
  });

  it("revokes the current session and clears cookies", async () => {
    resolveAccessTokenSessionMock.mockResolvedValue({
      user: {
        id: "user_1",
        email: "member@example.com",
        name: "Member",
        role: "member",
        avatarUrl: null,
      },
      authMode: "password",
    });
    getRefreshTokenFromCookieMock.mockReturnValue("cookie-refresh");
    listAuthSessionsForUserMock.mockResolvedValue([
      {
        id: "rt_current",
        clientType: "web",
        authMode: "password",
        deviceName: "Chrome on Windows",
        createdAt: new Date("2026-03-12T00:00:00.000Z"),
        lastSeenAt: new Date("2026-03-12T00:10:00.000Z"),
        expiresAt: new Date("2026-04-11T00:00:00.000Z"),
        current: true,
      },
    ]);
    revokeAuthSessionByIdMock.mockResolvedValue(true);

    const response = await createApp().request("http://localhost/api/users/me/sessions/rt_current", {
      method: "DELETE",
      headers: {
        authorization: "Bearer access-token",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(revokeAuthSessionByIdMock).toHaveBeenCalledWith({
      userId: "user_1",
      sessionId: "rt_current",
    });
    expect(clearPasswordSessionCookiesMock).toHaveBeenCalled();
  });
});
