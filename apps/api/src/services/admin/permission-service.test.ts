import { beforeEach, describe, expect, it, vi } from "vitest";

const { listPagePermissionsMock, listGroupsMock, getPageInheritanceMock, dbMock } = vi.hoisted(
  () => {
    const selectFromWhereMock = vi.fn();
    return {
      listPagePermissionsMock: vi.fn(),
      listGroupsMock: vi.fn(),
      getPageInheritanceMock: vi.fn(),
      dbMock: {
        transaction: vi.fn(),
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: selectFromWhereMock,
          })),
        })),
        insert: vi.fn(() => ({
          values: vi.fn(),
        })),
        delete: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(),
          })),
        })),
        _selectFromWhereMock: selectFromWhereMock,
      },
    };
  }
);

vi.mock("../../repositories/admin/admin-repository.js", () => ({
  getPageInheritance: getPageInheritanceMock,
  listGroups: listGroupsMock,
  listPagePermissions: listPagePermissionsMock,
}));

vi.mock("../../db/index.js", () => ({
  db: dbMock,
}));

vi.mock("../../db/schema.js", () => ({
  pagePermissions: { pageId: "pageId", groupId: "groupId" },
  pageInheritance: { pageId: "pageId" },
  spacePermissions: { spaceId: "spaceId", groupId: "groupId" },
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
    dbMock.transaction.mockReset();
    dbMock.select.mockClear();
    dbMock._selectFromWhereMock.mockReset();
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
    it("deletes existing permissions and inserts new ones in a transaction", async () => {
      const deleteMock = vi.fn(() => ({ where: vi.fn() }));
      const insertMock = vi.fn(() => ({ values: vi.fn() }));

      dbMock.transaction.mockImplementation(
        async (
          callback: (tx: { delete: typeof deleteMock; insert: typeof insertMock }) => unknown
        ) => callback({ delete: deleteMock, insert: insertMock })
      );

      await replacePagePermissions("page1", false, [
        { groupId: "g1", canRead: true, canWrite: true, canDelete: false },
        { groupId: "g2", canRead: true, canWrite: false, canDelete: false },
      ]);

      expect(dbMock.transaction).toHaveBeenCalledTimes(1);
      // delete pagePermissions + delete pageInheritance = 2 deletes
      expect(deleteMock).toHaveBeenCalledTimes(2);
      // insert pageInheritance + 2 permission inserts = 3 inserts
      expect(insertMock).toHaveBeenCalledTimes(3);
    });
  });

  describe("replacePageInheritance", () => {
    it("replaces inheritance record in a transaction", async () => {
      const deleteMock = vi.fn(() => ({ where: vi.fn() }));
      const insertMock = vi.fn(() => ({ values: vi.fn() }));

      dbMock.transaction.mockImplementation(
        async (
          callback: (tx: { delete: typeof deleteMock; insert: typeof insertMock }) => unknown
        ) => callback({ delete: deleteMock, insert: insertMock })
      );

      await replacePageInheritance("page1", true);

      expect(dbMock.transaction).toHaveBeenCalledTimes(1);
      expect(deleteMock).toHaveBeenCalledTimes(1);
      expect(insertMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("getSpacePermissionsDetail", () => {
    it("returns space permissions with group names", async () => {
      dbMock._selectFromWhereMock.mockResolvedValue([
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
      dbMock._selectFromWhereMock.mockResolvedValue([
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
    it("deletes existing and inserts new space permissions", async () => {
      const deleteMock = vi.fn(() => ({ where: vi.fn() }));
      const insertMock = vi.fn(() => ({ values: vi.fn() }));

      dbMock.transaction.mockImplementation(
        async (
          callback: (tx: { delete: typeof deleteMock; insert: typeof insertMock }) => unknown
        ) => callback({ delete: deleteMock, insert: insertMock })
      );

      await replaceSpacePermissions("s1", [
        { groupId: "g1", canRead: true, canWrite: true, canDelete: true },
      ]);

      expect(dbMock.transaction).toHaveBeenCalledTimes(1);
      expect(deleteMock).toHaveBeenCalledTimes(1);
      expect(insertMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("deleteSpacePermissionForGroup", () => {
    it("returns true when a record is deleted", async () => {
      const returningMock = vi.fn().mockResolvedValue([{ id: "sp1" }]);
      const whereMock = vi.fn(() => ({ returning: returningMock }));
      // biome-ignore lint/suspicious/noExplicitAny: mock chain
      dbMock.delete = vi.fn(() => ({ where: whereMock })) as any;

      const result = await deleteSpacePermissionForGroup("s1", "g1");

      expect(result).toBe(true);
    });

    it("returns false when no record is deleted", async () => {
      const returningMock = vi.fn().mockResolvedValue([]);
      const whereMock = vi.fn(() => ({ returning: returningMock }));
      // biome-ignore lint/suspicious/noExplicitAny: mock chain
      dbMock.delete = vi.fn(() => ({ where: whereMock })) as any;

      const result = await deleteSpacePermissionForGroup("s1", "nonexistent");

      expect(result).toBe(false);
    });
  });
});
