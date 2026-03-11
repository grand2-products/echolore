import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv, SessionUser } from "../lib/auth.js";
import { usersRoutes } from "./users.js";

const {
  deleteUserMock,
  getUserByEmailMock,
  getUserByIdMock,
  listUsersMock,
  createUserMock,
  updateUserMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  deleteUserMock: vi.fn(),
  getUserByEmailMock: vi.fn(),
  getUserByIdMock: vi.fn(),
  listUsersMock: vi.fn(),
  createUserMock: vi.fn(),
  updateUserMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("../repositories/user/user-repository.js", () => ({
  deleteUser: deleteUserMock,
  getUserByEmail: getUserByEmailMock,
  getUserById: getUserByIdMock,
  listUsers: listUsersMock,
  createUser: createUserMock,
  updateUser: updateUserMock,
}));

vi.mock("../lib/audit.js", () => ({
  writeAuditLog: writeAuditLogMock,
}));

function createApp(sessionUser: SessionUser) {
  const app = new Hono<AppEnv>();

  app.use("/api/*", async (c, next) => {
    c.set("user", sessionUser);
    await next();
  });

  app.route("/api/users", usersRoutes);
  return app;
}

describe("usersRoutes", () => {
  beforeEach(() => {
    deleteUserMock.mockReset();
    getUserByEmailMock.mockReset();
    getUserByIdMock.mockReset();
    listUsersMock.mockReset();
    createUserMock.mockReset();
    updateUserMock.mockReset();
    writeAuditLogMock.mockReset();
  });

  it("rejects updating another user for non-admin sessions", async () => {
    const app = createApp({
      id: "member_1",
      email: "member@example.com",
      name: "Member",
      role: "member",
    });

    const response = await app.request("http://localhost/api/users/member_2", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Changed" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(updateUserMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "authz.denied",
        resourceType: "user",
        resourceId: "member_2",
      })
    );
  });

  it("rejects deleting another user for non-admin sessions", async () => {
    const app = createApp({
      id: "member_1",
      email: "member@example.com",
      name: "Member",
      role: "member",
    });

    const response = await app.request("http://localhost/api/users/member_2", {
      method: "DELETE",
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "authz.denied",
        resourceType: "user",
        resourceId: "member_2",
      })
    );
  });
});
