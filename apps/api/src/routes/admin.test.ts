import { UserRole } from "@corp-internal/shared/contracts";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv, SessionUser } from "../lib/auth.js";
import { requireRole } from "../lib/auth.js";
import { adminRoutes } from "./admin/index.js";

const {
  addGroupMembersMock,
  createGroupMock,
  listGroupsWithMemberCountsMock,
  replaceUserGroupsMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  addGroupMembersMock: vi.fn(),
  createGroupMock: vi.fn(),
  listGroupsWithMemberCountsMock: vi.fn(),
  replaceUserGroupsMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("../services/admin/admin-service.js", () => ({
  addGroupMembers: addGroupMembersMock,
  getGroupDetail: vi.fn(),
  getPagePermissionsDetail: vi.fn(),
  listGroupMembers: vi.fn(),
  listGroupsWithMemberCounts: listGroupsWithMemberCountsMock,
  listUsersWithGroups: vi.fn(),
  replacePageInheritance: vi.fn(),
  replacePagePermissions: vi.fn(),
  replaceUserGroups: replaceUserGroupsMock,
}));

vi.mock("../repositories/admin/admin-repository.js", () => ({
  createGroup: createGroupMock,
  deleteGroup: vi.fn(),
  deleteMembership: vi.fn(),
  deletePagePermission: vi.fn(),
  getGroupById: vi.fn(),
  getGroupByName: vi.fn(),
  getPageInheritance: vi.fn(),
  updateGroup: vi.fn(),
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
  app.use("/api/admin/*", requireRole(UserRole.Admin));
  app.route("/api/admin", adminRoutes);

  return app;
}

describe("adminRoutes", () => {
  beforeEach(() => {
    addGroupMembersMock.mockReset();
    createGroupMock.mockReset();
    listGroupsWithMemberCountsMock.mockReset();
    replaceUserGroupsMock.mockReset();
    writeAuditLogMock.mockReset();
  });

  it.each([
    {
      name: "GET group listing",
      request: () => ({ url: "http://localhost/api/admin/groups", init: undefined }),
    },
    {
      name: "POST group creation",
      request: () => ({
        url: "http://localhost/api/admin/groups",
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Engineering", permissions: ["wiki.read"] }),
        },
      }),
    },
    {
      name: "POST group member mutation",
      request: () => ({
        url: "http://localhost/api/admin/groups/group_1/members",
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userIds: ["user_2"] }),
        },
      }),
    },
    {
      name: "PUT user group assignment",
      request: () => ({
        url: "http://localhost/api/admin/users/user_2/groups",
        init: {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ groupIds: ["group_1"] }),
        },
      }),
    },
  ])("rejects $name for non-admin sessions", async ({ request }) => {
    const app = createApp({
      id: "user_1",
      email: "member@example.com",
      name: "Member",
      role: UserRole.Member,
    });

    const { url, init } = request();
    const response = await app.request(url, init);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: "FORBIDDEN", error: "Forbidden" });
    expect(listGroupsWithMemberCountsMock).not.toHaveBeenCalled();
    expect(createGroupMock).not.toHaveBeenCalled();
    expect(addGroupMembersMock).not.toHaveBeenCalled();
    expect(replaceUserGroupsMock).not.toHaveBeenCalled();
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "authz.denied",
        resourceType: "role",
      })
    );
    expect(writeAuditLogMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.stringMatching(/^admin\./),
      })
    );
  });
});
