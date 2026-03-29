import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listGroupsMock,
  listMembershipsMock,
  getGroupByIdMock,
  listMembershipsByGroupMock,
  listUsersWithIdsMock,
  listUsersForAdminMock,
  addGroupMembersRepoMock,
  replaceUserGroupsRepoMock,
} = vi.hoisted(() => ({
  listGroupsMock: vi.fn(),
  listMembershipsMock: vi.fn(),
  getGroupByIdMock: vi.fn(),
  listMembershipsByGroupMock: vi.fn(),
  listUsersWithIdsMock: vi.fn(),
  listUsersForAdminMock: vi.fn(),
  addGroupMembersRepoMock: vi.fn(),
  replaceUserGroupsRepoMock: vi.fn(),
}));

vi.mock("../../repositories/admin/admin-repository.js", () => ({
  addGroupMembers: addGroupMembersRepoMock,
  getGroupById: getGroupByIdMock,
  listGroups: listGroupsMock,
  listMemberships: listMembershipsMock,
  listMembershipsByGroup: listMembershipsByGroupMock,
  listUsersForAdmin: listUsersForAdminMock,
  listUsersWithIds: listUsersWithIdsMock,
  replaceUserGroups: replaceUserGroupsRepoMock,
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
    addGroupMembersRepoMock.mockReset();
    replaceUserGroupsRepoMock.mockReset();
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
      addGroupMembersRepoMock.mockResolvedValue([
        { id: "membership_new1", userId: "u2", groupId: "g1" },
      ]);

      const result = await addGroupMembers("g1", ["u1", "u2"]);

      expect(result).toEqual([{ id: "membership_new1", userId: "u2", groupId: "g1" }]);
      expect(addGroupMembersRepoMock).toHaveBeenCalledWith("g1", ["u1", "u2"]);
    });
  });

  describe("replaceUserGroups", () => {
    it("deletes existing memberships and inserts new ones", async () => {
      replaceUserGroupsRepoMock.mockResolvedValue(undefined);

      await replaceUserGroups("u1", ["g1", "g2"]);

      expect(replaceUserGroupsRepoMock).toHaveBeenCalledWith("u1", ["g1", "g2"]);
    });
  });
});
