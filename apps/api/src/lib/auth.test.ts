import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authGuard, type AppEnv } from "./auth.js";

const {
  getAccessTokenFromCookieMock,
  reconcileGoogleIdentityMock,
  resolveAccessTokenSessionMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  getAccessTokenFromCookieMock: vi.fn(),
  reconcileGoogleIdentityMock: vi.fn(),
  resolveAccessTokenSessionMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("./local-auth.js", () => ({
  getAccessTokenFromCookie: getAccessTokenFromCookieMock,
  reconcileGoogleIdentity: reconcileGoogleIdentityMock,
  resolveAccessTokenSession: resolveAccessTokenSessionMock,
}));

vi.mock("./audit.js", () => ({
  writeAuditLog: writeAuditLogMock,
}));

describe("authGuard", () => {
  beforeEach(() => {
    getAccessTokenFromCookieMock.mockReset();
    reconcileGoogleIdentityMock.mockReset();
    resolveAccessTokenSessionMock.mockReset();
    writeAuditLogMock.mockReset();
  });

  it("accepts bearer access tokens on protected API routes", async () => {
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
        role: "member",
        avatarUrl: null,
      },
      authMode: "password",
      authTransport: "bearer",
    });
    expect(resolveAccessTokenSessionMock).toHaveBeenCalledWith({ accessToken: "access-token" });
  });
});
