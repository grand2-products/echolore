import { UserRole } from "@echolore/shared/contracts";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type AppEnv, requireRole } from "./auth.js";

const { writeAuditLogMock } = vi.hoisted(() => ({
  writeAuditLogMock: vi.fn(),
}));

vi.mock("./audit.js", () => ({
  writeAuditLog: writeAuditLogMock,
}));

function createApp(requiredRole: UserRole) {
  const app = new Hono<AppEnv>();
  // Simulate a pre-authenticated user via middleware
  app.use("/*", async (c, next) => {
    const role = c.req.header("x-test-role") as UserRole;
    const userId = c.req.header("x-test-user-id") ?? "user_1";
    if (role) {
      c.set("user", {
        id: userId,
        email: `${userId}@example.com`,
        name: "Test User",
        role,
      });
    }
    await next();
  });
  app.use("/*", requireRole(requiredRole));
  app.get("/admin/test", (c) => c.json({ user: c.get("user") }));
  return app;
}

describe("requireRole", () => {
  beforeEach(() => {
    writeAuditLogMock.mockReset();
  });

  it("allows admin users to access admin-only routes", async () => {
    const app = createApp(UserRole.Admin);
    const response = await app.request("http://localhost/admin/test", {
      headers: { "x-test-role": UserRole.Admin, "x-test-user-id": "admin_1" },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user.role).toBe(UserRole.Admin);
  });

  it("denies non-admin users from admin-only routes", async () => {
    const app = createApp(UserRole.Admin);
    const response = await app.request("http://localhost/admin/test", {
      headers: { "x-test-role": UserRole.Member, "x-test-user-id": "member_1" },
    });

    expect(response.status).toBe(403);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "member_1",
        action: "authz.denied",
        resourceType: "role",
        metadata: expect.objectContaining({
          requiredRole: UserRole.Admin,
          actualRole: UserRole.Member,
        }),
      })
    );
  });

  it("returns 401 when no user is set in context", async () => {
    const app = createApp(UserRole.Admin);
    const response = await app.request("http://localhost/admin/test");

    expect(response.status).toBe(401);
  });
});
