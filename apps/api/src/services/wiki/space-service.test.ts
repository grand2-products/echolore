import { UserRole } from "@echolore/shared/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFindGeneralSpace,
  mockCreateSpace,
  mockFindPersonalSpaceByUserId,
  mockListSpaces,
  mockFindTeamSpaceByGroupId,
  mockListGroups,
  mockListMembershipsByUser,
  mockListSpacePermissionsByGroupIds,
  mockListSpacePermissionsForSpace,
} = vi.hoisted(() => ({
  mockFindGeneralSpace: vi.fn(),
  mockCreateSpace: vi.fn(),
  mockFindPersonalSpaceByUserId: vi.fn(),
  mockListSpaces: vi.fn(),
  mockFindTeamSpaceByGroupId: vi.fn(),
  mockListGroups: vi.fn(),
  mockListMembershipsByUser: vi.fn(),
  mockListSpacePermissionsByGroupIds: vi.fn(),
  mockListSpacePermissionsForSpace: vi.fn(),
}));

vi.mock("../../repositories/wiki/space-repository.js", () => ({
  findGeneralSpace: mockFindGeneralSpace,
  createSpace: mockCreateSpace,
  findPersonalSpaceByUserId: mockFindPersonalSpaceByUserId,
  listSpaces: mockListSpaces,
  findTeamSpaceByGroupId: mockFindTeamSpaceByGroupId,
}));

vi.mock("../../repositories/admin/admin-repository.js", () => ({
  listGroups: mockListGroups,
  listMembershipsByUser: mockListMembershipsByUser,
  listSpacePermissionsByGroupIds: mockListSpacePermissionsByGroupIds,
  listSpacePermissionsForSpace: mockListSpacePermissionsForSpace,
}));

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "mock12nanoid"),
}));

import type { SessionUser } from "../../lib/auth.js";
import {
  canAccessSpace,
  ensureGeneralSpace,
  GENERAL_SPACE_ID,
  getOrCreatePersonalSpace,
  listVisibleSpaces,
} from "./space-service.js";

function makeSpace(overrides: Record<string, unknown> = {}) {
  return {
    id: "space_default",
    name: "Test",
    type: "general",
    owner_user_id: null,
    group_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "user_1",
    email: "user@test.com",
    name: "Test User",
    role: UserRole.Member,
    ...overrides,
  };
}

describe("space-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mockListGroups.mockResolvedValue([]);
    mockListMembershipsByUser.mockResolvedValue([]);
    mockListSpacePermissionsByGroupIds.mockResolvedValue([]);
    mockListSpacePermissionsForSpace.mockResolvedValue([]);
  });

  describe("ensureGeneralSpace", () => {
    it("returns existing general space when it exists", async () => {
      const existing = makeSpace({ id: GENERAL_SPACE_ID, type: "general" });
      mockFindGeneralSpace.mockResolvedValue(existing);

      const result = await ensureGeneralSpace();

      expect(result).toBe(existing);
      expect(mockCreateSpace).not.toHaveBeenCalled();
    });

    it("creates general space when it does not exist", async () => {
      mockFindGeneralSpace.mockResolvedValue(null);
      const created = makeSpace({ id: GENERAL_SPACE_ID, type: "general" });
      mockCreateSpace.mockResolvedValue(created);

      const result = await ensureGeneralSpace();

      expect(result).toBe(created);
      expect(mockCreateSpace).toHaveBeenCalledWith(
        expect.objectContaining({
          id: GENERAL_SPACE_ID,
          name: "General",
          type: "general",
        })
      );
    });

    it("handles race condition by retrying findGeneralSpace", async () => {
      mockFindGeneralSpace.mockResolvedValueOnce(null);
      mockCreateSpace.mockRejectedValue(new Error("unique constraint"));
      const existing = makeSpace({ id: GENERAL_SPACE_ID });
      mockFindGeneralSpace.mockResolvedValueOnce(existing);

      const result = await ensureGeneralSpace();

      expect(result).toBe(existing);
    });

    it("throws when create fails and retry also returns null", async () => {
      mockFindGeneralSpace.mockResolvedValue(null);
      mockCreateSpace.mockRejectedValue(new Error("db error"));

      await expect(ensureGeneralSpace()).rejects.toThrow("Failed to create general space");
    });
  });

  describe("listVisibleSpaces", () => {
    it("returns all spaces including other users personal spaces for admin", async () => {
      const admin = makeUser({ id: "admin_1", role: UserRole.Admin });
      const ownPersonal = makeSpace({ id: "s_own", type: "personal", owner_user_id: "admin_1" });
      const otherPersonal = makeSpace({ id: "s_other", type: "personal", owner_user_id: "other" });
      const spaces = [
        makeSpace({ id: "s1", type: "general" }),
        ownPersonal,
        otherPersonal,
        makeSpace({ id: "s3", type: "team", group_id: "g1" }),
      ];

      mockFindGeneralSpace.mockResolvedValue(spaces[0]);
      mockFindPersonalSpaceByUserId.mockResolvedValue(ownPersonal);
      mockListSpaces.mockResolvedValue(spaces);

      const result = await listVisibleSpaces(admin);

      expect(result).toContainEqual(expect.objectContaining({ id: "s1" }));
      expect(result).toContainEqual(expect.objectContaining({ id: "s_own" }));
      expect(result).toContainEqual(expect.objectContaining({ id: "s_other" }));
      expect(result).toContainEqual(expect.objectContaining({ id: "s3" }));
    });

    it("filters spaces for non-admin users based on permissions", async () => {
      const user = makeUser({ id: "user_1", role: UserRole.Member });
      const generalSpace = makeSpace({ id: "s1", type: "general" });
      const ownPersonal = makeSpace({ id: "s2", type: "personal", owner_user_id: "user_1" });
      const otherPersonal = makeSpace({ id: "s3", type: "personal", owner_user_id: "other" });
      const teamSpace = makeSpace({ id: "s4", type: "team", group_id: "g1" });

      mockFindGeneralSpace.mockResolvedValue(generalSpace);
      mockFindPersonalSpaceByUserId.mockResolvedValue(ownPersonal);
      mockListSpaces.mockResolvedValue([generalSpace, ownPersonal, otherPersonal, teamSpace]);

      // User is in group g1
      mockListMembershipsByUser.mockResolvedValue([{ group_id: "g1", user_id: "user_1" }]);
      // No explicit space permissions
      mockListSpacePermissionsByGroupIds.mockResolvedValue([]);

      const result = await listVisibleSpaces(user);

      // Should see all spaces including other's personal space (public read)
      expect(result).toContainEqual(expect.objectContaining({ id: "s1" }));
      expect(result).toContainEqual(expect.objectContaining({ id: "s2" }));
      expect(result).toContainEqual(expect.objectContaining({ id: "s3" }));
      expect(result).toContainEqual(expect.objectContaining({ id: "s4" }));
    });
  });

  describe("getOrCreatePersonalSpace", () => {
    it("returns existing personal space", async () => {
      const user = makeUser();
      const existing = makeSpace({ type: "personal", owner_user_id: user.id });
      mockFindPersonalSpaceByUserId.mockResolvedValue(existing);

      const result = await getOrCreatePersonalSpace(user);

      expect(result).toBe(existing);
      expect(mockCreateSpace).not.toHaveBeenCalled();
    });

    it("creates personal space when none exists", async () => {
      const user = makeUser({ id: "user_1", name: "Alice" });
      mockFindPersonalSpaceByUserId.mockResolvedValue(null);
      const created = makeSpace({ type: "personal", owner_user_id: user.id, name: "Alice" });
      mockCreateSpace.mockResolvedValue(created);

      const result = await getOrCreatePersonalSpace(user);

      expect(result).toBe(created);
      expect(mockCreateSpace).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Alice",
          type: "personal",
          owner_user_id: "user_1",
        })
      );
    });

    it("handles race condition on create", async () => {
      const user = makeUser();
      mockFindPersonalSpaceByUserId.mockResolvedValueOnce(null);
      mockCreateSpace.mockRejectedValue(new Error("unique constraint"));
      const existing = makeSpace({ type: "personal", owner_user_id: user.id });
      mockFindPersonalSpaceByUserId.mockResolvedValueOnce(existing);

      const result = await getOrCreatePersonalSpace(user);

      expect(result).toBe(existing);
    });
  });

  describe("canAccessSpace", () => {
    it("grants admin access to any space", async () => {
      const admin = makeUser({ role: UserRole.Admin });
      const space = makeSpace({ type: "team", group_id: "g1" });

      const result = await canAccessSpace(admin, space as never);

      expect(result).toBe(true);
    });

    it("grants personal space read access to everyone", async () => {
      const owner = makeUser({ id: "user_owner" });
      const otherUser = makeUser({ id: "user_other" });
      const space = makeSpace({ type: "personal", owner_user_id: "user_owner" });

      expect(await canAccessSpace(owner, space as never, "read")).toBe(true);
      expect(await canAccessSpace(otherUser, space as never, "read")).toBe(true);
    });

    it("grants personal space write/delete only to owner", async () => {
      const owner = makeUser({ id: "user_owner" });
      const otherUser = makeUser({ id: "user_other" });
      const admin = makeUser({ id: "admin_1", role: UserRole.Admin });
      const space = makeSpace({ type: "personal", owner_user_id: "user_owner" });

      expect(await canAccessSpace(owner, space as never, "write")).toBe(true);
      expect(await canAccessSpace(owner, space as never, "delete")).toBe(true);
      expect(await canAccessSpace(otherUser, space as never, "write")).toBe(false);
      expect(await canAccessSpace(admin, space as never, "write")).toBe(false);
    });

    it("grants general space access via fallback when no explicit permissions", async () => {
      const user = makeUser();
      const space = makeSpace({ type: "general" });

      // userGroupMemberships returns empty
      mockListMembershipsByUser.mockResolvedValue([]);

      const result = await canAccessSpace(user, space as never);

      expect(result).toBe(true);
    });

    it("uses space permissions when defined for user groups", async () => {
      const user = makeUser();
      const space = makeSpace({ id: "s1", type: "team", group_id: "g1" });

      // User is in group g1
      mockListMembershipsByUser.mockResolvedValue([{ group_id: "g1", user_id: "user_1" }]);
      // Space permissions allow read
      mockListSpacePermissionsForSpace.mockResolvedValue([
        { can_read: true, can_write: false, can_delete: false },
      ]);

      const result = await canAccessSpace(user, space as never, "read");

      expect(result).toBe(true);
    });

    it("denies write access when permission is false", async () => {
      const user = makeUser();
      const space = makeSpace({ id: "s1", type: "team", group_id: "g1" });

      // User is in group g1
      mockListMembershipsByUser.mockResolvedValue([{ group_id: "g1", user_id: "user_1" }]);
      // Space permissions deny write
      mockListSpacePermissionsForSpace.mockResolvedValue([
        { can_read: true, can_write: false, can_delete: false },
      ]);

      const result = await canAccessSpace(user, space as never, "write");

      expect(result).toBe(false);
    });
  });
});
