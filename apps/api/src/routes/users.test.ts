import { UserRole } from "@echolore/shared/contracts";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type AppEnv, authGuard } from "../lib/auth.js";
import { memberUser } from "../test-utils/index.js";
import { usersRoutes } from "./users.js";

const {
  getUserByIdMock,
  listAuthSessionsForUserMock,
  resolveAccessTokenSessionMock,
  revokeAuthSessionByIdMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getUserByIdMock: vi.fn(),
  listAuthSessionsForUserMock: vi.fn(),
  resolveAccessTokenSessionMock: vi.fn(),
  revokeAuthSessionByIdMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("../lib/local-auth.js", () => ({
  listAuthSessionsForUser: listAuthSessionsForUserMock,
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
    getUserByIdMock.mockReset();
    listAuthSessionsForUserMock.mockReset();
    resolveAccessTokenSessionMock.mockReset();
    revokeAuthSessionByIdMock.mockReset();
    writeAuditLogMock.mockReset();
  });

  it("serves /api/users/me through bearer auth", async () => {
    resolveAccessTokenSessionMock.mockResolvedValue({
      user: memberUser(),
      authMode: "password",
    });
    getUserByIdMock.mockResolvedValue({
      id: "user_1",
      email: "member@example.com",
      name: "Member",
      avatarUrl: null,
      role: UserRole.Member,
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
        role: UserRole.Member,
        emailVerifiedAt: "2026-03-12T00:00:00.000Z",
        tokenVersion: 1,
        createdAt: "2026-03-12T00:00:00.000Z",
        updatedAt: "2026-03-12T00:00:00.000Z",
      },
    });
  });

  it("lists current user auth sessions", async () => {
    resolveAccessTokenSessionMock.mockResolvedValue({
      user: memberUser(),
      authMode: "password",
    });
    listAuthSessionsForUserMock.mockResolvedValue([
      {
        id: "rt_1",
        clientType: "mobile",
        authMode: "password",
        deviceName: "iPhone",
        createdAt: new Date("2026-03-12T00:00:00.000Z"),
        lastSeenAt: new Date("2026-03-12T00:10:00.000Z"),
        expiresAt: new Date("2026-04-11T00:00:00.000Z"),
        current: false,
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
          clientType: "mobile",
          authMode: "password",
          deviceName: "iPhone",
          createdAt: "2026-03-12T00:00:00.000Z",
          lastSeenAt: "2026-03-12T00:10:00.000Z",
          expiresAt: "2026-04-11T00:00:00.000Z",
          current: false,
        },
      ],
    });
  });

  it("revokes a session by id", async () => {
    resolveAccessTokenSessionMock.mockResolvedValue({
      user: memberUser(),
      authMode: "password",
    });
    revokeAuthSessionByIdMock.mockResolvedValue(true);

    const response = await createApp().request(
      "http://localhost/api/users/me/sessions/rt_current",
      {
        method: "DELETE",
        headers: {
          authorization: "Bearer access-token",
        },
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(revokeAuthSessionByIdMock).toHaveBeenCalledWith({
      userId: "user_1",
      sessionId: "rt_current",
    });
  });
});
