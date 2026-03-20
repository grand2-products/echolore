import { UserRole } from "@echolore/shared/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireRole } from "../lib/auth.js";
import { createTestApp, memberUser } from "../test-utils/index.js";
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
  changeUserRole: vi.fn(),
  createAgentDefinition: vi.fn(),
  deleteSpacePermissionForGroup: vi.fn(),
  getAuthSettings: vi.fn(async () => ({})),
  getEmailSettings: vi.fn(async () => ({})),
  getGcpCredentials: vi.fn(async () => ({})),
  getGroupDetail: vi.fn(),
  getLlmSettings: vi.fn(async () => ({})),
  getPagePermissionsDetail: vi.fn(),
  getSiteSettings: vi.fn(async () => ({})),
  getSpacePermissionsDetail: vi.fn(),
  getStorageSettings: vi.fn(async () => ({})),
  listAvailableAgents: vi.fn(async () => []),
  listGroupMembers: vi.fn(),
  listGroupsWithMemberCounts: listGroupsWithMemberCountsMock,
  listUsersWithGroups: vi.fn(),
  replacePageInheritance: vi.fn(),
  replacePagePermissions: vi.fn(),
  replaceSpacePermissions: vi.fn(),
  replaceUserGroups: replaceUserGroupsMock,
  updateAgentDefinition: vi.fn(),
  updateAuthSettings: vi.fn(),
  updateEmailSettings: vi.fn(),
  updateGcpCredentials: vi.fn(),
  updateLlmSettings: vi.fn(),
  updateSiteSettings: vi.fn(),
  updateStorageSettings: vi.fn(),
}));

vi.mock("../services/admin/group-service.js", () => ({
  createGroup: createGroupMock,
  deleteGroup: vi.fn(),
  deleteMembership: vi.fn(),
  getGroupById: vi.fn(),
  getGroupByName: vi.fn(),
  updateGroup: vi.fn(),
}));

vi.mock("../services/admin/site-settings-service.js", () => ({
  deleteSiteSetting: vi.fn(),
  getSiteSetting: vi.fn(),
  getSiteSettings: vi.fn(async () => ({})),
  updateSiteSettings: vi.fn(),
  upsertSiteSetting: vi.fn(),
}));

vi.mock("../services/admin/permission-service.js", () => ({
  deletePagePermission: vi.fn(),
  getPageInheritance: vi.fn(),
}));

vi.mock("../services/wiki/space-service.js", () => ({
  ensureTeamSpaceForGroup: vi.fn(),
  getSpaceById: vi.fn(),
}));

vi.mock("../services/wiki/embedding-service.js", () => ({
  reindexAllPages: vi.fn(async () => ({ indexed: 0, errors: 0 })),
}));

vi.mock("../lib/file-storage.js", () => ({
  createStorageProvider: vi.fn(),
  removeFile: vi.fn(),
  saveFile: vi.fn(),
  setStorageProvider: vi.fn(),
}));

vi.mock("../lib/secret-mask.js", () => ({
  maskSecrets: vi.fn((v: unknown) => v),
  stripMaskedValues: vi.fn((v: unknown) => v),
}));

vi.mock("../lib/audit.js", () => ({
  writeAuditLog: writeAuditLogMock,
}));

function createApp(user: ReturnType<typeof memberUser>) {
  return createTestApp("/api/admin", adminRoutes, user, [requireRole(UserRole.Admin)]);
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
    const app = createApp(memberUser());

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
