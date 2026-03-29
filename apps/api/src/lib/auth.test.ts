import { UserRole } from "@echolore/shared/contracts";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type AppEnv, authGuard } from "./auth.js";

const { resolveAccessTokenSessionMock, writeAuditLogMock } = vi.hoisted(() => ({
  resolveAccessTokenSessionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("../services/auth/session-service.js", () => ({
  resolveAccessTokenSession: resolveAccessTokenSessionMock,
}));

vi.mock("./audit.js", () => ({
  writeAuditLog: writeAuditLogMock,
}));

describe("authGuard", () => {
  beforeEach(() => {
    resolveAccessTokenSessionMock.mockReset();
    writeAuditLogMock.mockReset();
  });

  it("accepts bearer access tokens on protected API routes", async () => {
    resolveAccessTokenSessionMock.mockResolvedValue({
      user: {
        id: "user_1",
        email: "member@example.com",
        name: "Member",
        role: UserRole.Member,
        avatarUrl: null,
      },
      authMode: "password",
    });

    const app = new Hono<AppEnv>();
    app.use("/api/*", authGuard);
    app.get("/api/protected", (c) =>
      c.json({
        user: c.get("user"),
        authMode: c.get("authMode"),
        authTransport: c.get("authTransport"),
      })
    );

    const response = await app.request("http://localhost/api/protected", {
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
        role: UserRole.Member,
        avatarUrl: null,
      },
      authMode: "password",
      authTransport: "bearer",
    });
    expect(resolveAccessTokenSessionMock).toHaveBeenCalledWith({ accessToken: "access-token" });
  });
});
