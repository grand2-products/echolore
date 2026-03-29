import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listPagePermissionsMock,
  listGroupsMock,
  getPageInheritanceMock,
  listSpacePermissionsMock,
  replacePagePermissionsRepoMock,
  replacePageInheritanceRepoMock,
  replaceSpacePermissionsRepoMock,
  deleteSpacePermissionForGroupRepoMock,
} = vi.hoisted(() => ({
  listPagePermissionsMock: vi.fn(),
  listGroupsMock: vi.fn(),
  getPageInheritanceMock: vi.fn(),
  listSpacePermissionsMock: vi.fn(),
  replacePagePermissionsRepoMock: vi.fn(),
  replacePageInheritanceRepoMock: vi.fn(),
  replaceSpacePermissionsRepoMock: vi.fn(),
  deleteSpacePermissionForGroupRepoMock: vi.fn(),
}));

vi.mock("../../repositories/admin/admin-repository.js", () => ({
  deleteSpacePermissionForGroup: deleteSpacePermissionForGroupRepoMock,
  getPageInheritance: getPageInheritanceMock,
  listGroups: listGroupsMock,
  listPagePermissions: listPagePermissionsMock,
  listSpacePermissions: listSpacePermissionsMock,
  replacePageInheritance: replacePageInheritanceRepoMock,
  replacePagePermissions: replacePagePermissionsRepoMock,
  replaceSpacePermissions: replaceSpacePermissionsRepoMock,
}));

import {
  deleteSpacePermissionForGroup,
  getPagePermissionsDetail,
  getSpacePermissionsDetail,
  replacePageInheritance,
  replacePagePermissions,
  replaceSpacePermissions,
} from "./permission-service.js";

describe("permission-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    listPagePermissionsMock.mockReset();
    listGroupsMock.mockReset();
    getPageInheritanceMock.mockReset();
    listSpacePermissionsMock.mockReset();
    replacePagePermissionsRepoMock.mockReset();
    replacePageInheritanceRepoMock.mockReset();
    replaceSpacePermissionsRepoMock.mockReset();
    deleteSpacePermissionForGroupRepoMock.mockReset();
  });

  describe("getPagePermissionsDetail", () => {
    it("returns page permissions with group info and inheritance", async () => {
      listPagePermissionsMock.mockResolvedValue([
        {
          id: "p1",
          pageId: "page1",
          groupId: "g1",
          canRead: true,
          canWrite: false,
          canDelete: false,
        },
      ]);
      listGroupsMock.mockResolvedValue([
        { id: "g1", name: "Engineering" },
        { id: "g2", name: "Design" },
      ]);
      getPageInheritanceMock.mockResolvedValue({ inheritFromParent: false });

      const result = await getPagePermissionsDetail("page1");

      expect(result).toEqual({
        pageId: "page1",
        inheritFromParent: false,
        permissions: [
          {
            id: "p1",
            pageId: "page1",
            groupId: "g1",
            canRead: true,
            canWrite: false,
            canDelete: false,
            group: { id: "g1", name: "Engineering" },
          },
        ],
      });
    });

    it("defaults inheritFromParent to true when no inheritance record exists", async () => {
      listPagePermissionsMock.mockResolvedValue([]);
      listGroupsMock.mockResolvedValue([]);
      getPageInheritanceMock.mockResolvedValue(null);

      const result = await getPagePermissionsDetail("page1");

      expect(result.inheritFromParent).toBe(true);
    });

    it("sets group to null when group not found", async () => {
      listPagePermissionsMock.mockResolvedValue([
        {
          id: "p1",
          pageId: "page1",
          groupId: "deleted_group",
          canRead: true,
          canWrite: false,
          canDelete: false,
        },
      ]);
      listGroupsMock.mockResolvedValue([]);
      getPageInheritanceMock.mockResolvedValue(null);

      const result = await getPagePermissionsDetail("page1");

      expect(result.permissions[0]?.group).toBeNull();
    });
  });

  describe("replacePagePermissions", () => {
    it("delegates to the repository with correct arguments", async () => {
      replacePagePermissionsRepoMock.mockResolvedValue(undefined);

      await replacePagePermissions("page1", false, [
        { groupId: "g1", canRead: true, canWrite: true, canDelete: false },
        { groupId: "g2", canRead: true, canWrite: false, canDelete: false },
      ]);

      expect(replacePagePermissionsRepoMock).toHaveBeenCalledWith("page1", false, [
        { groupId: "g1", canRead: true, canWrite: true, canDelete: false },
        { groupId: "g2", canRead: true, canWrite: false, canDelete: false },
      ]);
    });
  });

  describe("replacePageInheritance", () => {
    it("delegates to the repository with correct arguments", async () => {
      replacePageInheritanceRepoMock.mockResolvedValue(undefined);

      await replacePageInheritance("page1", true);

      expect(replacePageInheritanceRepoMock).toHaveBeenCalledWith("page1", true);
    });
  });

  describe("getSpacePermissionsDetail", () => {
    it("returns space permissions with group names", async () => {
      listSpacePermissionsMock.mockResolvedValue([
        {
          id: "sp1",
          spaceId: "s1",
          groupId: "g1",
          canRead: true,
          canWrite: true,
          canDelete: false,
        },
      ]);
      listGroupsMock.mockResolvedValue([{ id: "g1", name: "Engineering" }]);

      const result = await getSpacePermissionsDetail("s1");

      expect(result).toEqual({
        spaceId: "s1",
        permissions: [
          {
            id: "sp1",
            spaceId: "s1",
            groupId: "g1",
            canRead: true,
            canWrite: true,
            canDelete: false,
            groupName: "Engineering",
          },
        ],
      });
    });

    it("sets groupName to undefined when group not found", async () => {
      listSpacePermissionsMock.mockResolvedValue([
        {
          id: "sp1",
          spaceId: "s1",
          groupId: "deleted_g",
          canRead: true,
          canWrite: false,
          canDelete: false,
        },
      ]);
      listGroupsMock.mockResolvedValue([]);

      const result = await getSpacePermissionsDetail("s1");

      expect(result.permissions[0]?.groupName).toBeUndefined();
    });
  });

  describe("replaceSpacePermissions", () => {
    it("delegates to the repository with correct arguments", async () => {
      replaceSpacePermissionsRepoMock.mockResolvedValue(undefined);

      await replaceSpacePermissions("s1", [
        { groupId: "g1", canRead: true, canWrite: true, canDelete: true },
      ]);

      expect(replaceSpacePermissionsRepoMock).toHaveBeenCalledWith("s1", [
        { groupId: "g1", canRead: true, canWrite: true, canDelete: true },
      ]);
    });
  });

  describe("deleteSpacePermissionForGroup", () => {
    it("returns true when a record is deleted", async () => {
      deleteSpacePermissionForGroupRepoMock.mockResolvedValue(true);

      const result = await deleteSpacePermissionForGroup("s1", "g1");

      expect(result).toBe(true);
    });

    it("returns false when no record is deleted", async () => {
      deleteSpacePermissionForGroupRepoMock.mockResolvedValue(false);

      const result = await deleteSpacePermissionForGroup("s1", "nonexistent");

      expect(result).toBe(false);
    });
  });
});
