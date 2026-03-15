import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listGroupsMock,
  listMembershipsMock,
  getGroupByIdMock,
  listMembershipsByGroupMock,
  listUsersWithIdsMock,
  listUsersForAdminMock,
  dbMock,
} = vi.hoisted(() => {
  const selectFromWhereMock = vi.fn();
  return {
    listGroupsMock: vi.fn(),
    listMembershipsMock: vi.fn(),
    getGroupByIdMock: vi.fn(),
    listMembershipsByGroupMock: vi.fn(),
    listUsersWithIdsMock: vi.fn(),
    listUsersForAdminMock: vi.fn(),
    dbMock: {
      transaction: vi.fn(),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: selectFromWhereMock,
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(),
      })),
      _selectFromWhereMock: selectFromWhereMock,
    },
  };
});

vi.mock("../../repositories/admin/admin-repository.js", () => ({
  getGroupById: getGroupByIdMock,
  listGroups: listGroupsMock,
  listMemberships: listMembershipsMock,
  listMembershipsByGroup: listMembershipsByGroupMock,
  listUsersForAdmin: listUsersForAdminMock,
  listUsersWithIds: listUsersWithIdsMock,
}));

vi.mock("../../db/index.js", () => ({
  db: dbMock,
}));

vi.mock("../../db/schema.js", () => ({
  userGroupMemberships: {
    groupId: "groupId",
    userId: "userId",
  },
}));

import {
  addGroupMembers,
  getGroupDetail,
  listGroupMembers,
  listGroupsWithMemberCounts,
  listUsersWithGroups,
  replaceUserGroups,
} from "./group-service.js";

describe("group-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    listGroupsMock.mockReset();
    listMembershipsMock.mockReset();
    getGroupByIdMock.mockReset();
    listMembershipsByGroupMock.mockReset();
    listUsersWithIdsMock.mockReset();
    listUsersForAdminMock.mockReset();
    dbMock.transaction.mockReset();
    dbMock._selectFromWhereMock.mockReset();
  });

  describe("listGroupsWithMemberCounts", () => {
    it("returns groups with correct member counts", async () => {
      listGroupsMock.mockResolvedValue([
        { id: "g1", name: "Engineering" },
        { id: "g2", name: "Design" },
      ]);
      listMembershipsMock.mockResolvedValue([
        { groupId: "g1", userId: "u1" },
        { groupId: "g1", userId: "u2" },
        { groupId: "g2", userId: "u3" },
      ]);

      const result = await listGroupsWithMemberCounts();

      expect(result).toEqual([
        { id: "g1", name: "Engineering", memberCount: 2 },
        { id: "g2", name: "Design", memberCount: 1 },
      ]);
    });

    it("returns zero count for groups with no members", async () => {
      listGroupsMock.mockResolvedValue([{ id: "g1", name: "Empty Group" }]);
      listMembershipsMock.mockResolvedValue([]);

      const result = await listGroupsWithMemberCounts();

      expect(result).toEqual([{ id: "g1", name: "Empty Group", memberCount: 0 }]);
    });
  });

  describe("getGroupDetail", () => {
    it("returns group with member user IDs", async () => {
      getGroupByIdMock.mockResolvedValue({ id: "g1", name: "Engineering" });
      listMembershipsByGroupMock.mockResolvedValue([
        { userId: "u1", groupId: "g1" },
        { userId: "u2", groupId: "g1" },
      ]);

      const result = await getGroupDetail("g1");

      expect(result).toEqual({
        id: "g1",
        name: "Engineering",
        members: ["u1", "u2"],
      });
    });

    it("returns null when group does not exist", async () => {
      getGroupByIdMock.mockResolvedValue(null);

      const result = await getGroupDetail("nonexistent");

      expect(result).toBeNull();
      expect(listMembershipsByGroupMock).not.toHaveBeenCalled();
    });
  });

  describe("listGroupMembers", () => {
    it("returns members with their membership info", async () => {
      listMembershipsByGroupMock.mockResolvedValue([
        { userId: "u1", groupId: "g1", id: "m1" },
        { userId: "u2", groupId: "g1", id: "m2" },
      ]);
      listUsersWithIdsMock.mockResolvedValue([
        { id: "u1", name: "Alice" },
        { id: "u2", name: "Bob" },
      ]);

      const result = await listGroupMembers("g1");

      expect(result).toEqual([
        { id: "u1", name: "Alice", membership: { userId: "u1", groupId: "g1", id: "m1" } },
        { id: "u2", name: "Bob", membership: { userId: "u2", groupId: "g1", id: "m2" } },
      ]);
    });

    it("returns empty array when group has no members", async () => {
      listMembershipsByGroupMock.mockResolvedValue([]);

      const result = await listGroupMembers("g1");

      expect(result).toEqual([]);
      expect(listUsersWithIdsMock).not.toHaveBeenCalled();
    });
  });

  describe("listUsersWithGroups", () => {
    it("returns users with their associated groups", async () => {
      listUsersForAdminMock.mockResolvedValue([
        { id: "u1", name: "Alice" },
        { id: "u2", name: "Bob" },
      ]);
      listGroupsMock.mockResolvedValue([
        { id: "g1", name: "Engineering" },
        { id: "g2", name: "Design" },
      ]);
      listMembershipsMock.mockResolvedValue([
        { userId: "u1", groupId: "g1" },
        { userId: "u1", groupId: "g2" },
        { userId: "u2", groupId: "g2" },
      ]);

      const result = await listUsersWithGroups();

      expect(result).toEqual([
        {
          id: "u1",
          name: "Alice",
          groups: [
            { id: "g1", name: "Engineering" },
            { id: "g2", name: "Design" },
          ],
        },
        {
          id: "u2",
          name: "Bob",
          groups: [{ id: "g2", name: "Design" }],
        },
      ]);
    });

    it("returns users with empty groups when no memberships exist", async () => {
      listUsersForAdminMock.mockResolvedValue([{ id: "u1", name: "Alice" }]);
      listGroupsMock.mockResolvedValue([]);
      listMembershipsMock.mockResolvedValue([]);

      const result = await listUsersWithGroups();

      expect(result).toEqual([{ id: "u1", name: "Alice", groups: [] }]);
    });
  });

  describe("addGroupMembers", () => {
    it("inserts new members and skips existing ones", async () => {
      const insertReturningMock = vi.fn();
      const insertValuesMock = vi.fn(() => ({ returning: insertReturningMock }));
      const insertMock = vi.fn(() => ({ values: insertValuesMock }));
      const selectFromWhereMock = vi.fn();
      const selectFromMock = vi.fn(() => ({ where: selectFromWhereMock }));
      const selectMock = vi.fn(() => ({ from: selectFromMock }));

      // First user already exists, second does not
      selectFromWhereMock.mockResolvedValueOnce([{ id: "existing" }]).mockResolvedValueOnce([]);

      insertReturningMock.mockResolvedValueOnce([
        { id: "membership_new1", userId: "u2", groupId: "g1" },
      ]);

      dbMock.transaction.mockImplementation(
        async (
          callback: (tx: { select: typeof selectMock; insert: typeof insertMock }) => unknown
        ) => callback({ select: selectMock, insert: insertMock })
      );

      const result = await addGroupMembers("g1", ["u1", "u2"]);

      expect(result).toEqual([{ id: "membership_new1", userId: "u2", groupId: "g1" }]);
      expect(selectFromWhereMock).toHaveBeenCalledTimes(2);
      expect(insertReturningMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("replaceUserGroups", () => {
    it("deletes existing memberships and inserts new ones", async () => {
      const deleteMock = vi.fn(() => ({ where: vi.fn() }));
      const insertMock = vi.fn(() => ({ values: vi.fn() }));

      dbMock.transaction.mockImplementation(
        async (
          callback: (tx: { delete: typeof deleteMock; insert: typeof insertMock }) => unknown
        ) => callback({ delete: deleteMock, insert: insertMock })
      );

      await replaceUserGroups("u1", ["g1", "g2"]);

      expect(dbMock.transaction).toHaveBeenCalledTimes(1);
      expect(deleteMock).toHaveBeenCalledTimes(1);
      expect(insertMock).toHaveBeenCalledTimes(2);
    });
  });
});
