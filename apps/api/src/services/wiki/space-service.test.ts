import { UserRole } from "@echolore/shared/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFindGeneralSpace,
  mockCreateSpace,
  mockFindPersonalSpaceByUserId,
  mockListSpaces,
  mockFindTeamSpaceByGroupId,
  mockDbSelect,
  mockDbFrom,
  mockDbWhere,
} = vi.hoisted(() => ({
  mockFindGeneralSpace: vi.fn(),
  mockCreateSpace: vi.fn(),
  mockFindPersonalSpaceByUserId: vi.fn(),
  mockListSpaces: vi.fn(),
  mockFindTeamSpaceByGroupId: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbFrom: vi.fn(),
  mockDbWhere: vi.fn(),
}));

vi.mock("../../repositories/wiki/space-repository.js", () => ({
  findGeneralSpace: mockFindGeneralSpace,
  createSpace: mockCreateSpace,
  findPersonalSpaceByUserId: mockFindPersonalSpaceByUserId,
  listSpaces: mockListSpaces,
  findTeamSpaceByGroupId: mockFindTeamSpaceByGroupId,
}));

vi.mock("../../db/index.js", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
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
    ownerUserId: null,
    groupId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
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
    mockDbSelect.mockReturnValue({ from: mockDbFrom });
    // Return an object that is both thenable (for queries without .where())
    // and has a .where() method (for queries with conditions)
    mockDbFrom.mockImplementation(() => {
      const result = Promise.resolve([]);
      // biome-ignore lint/suspicious/noExplicitAny: mock chain
      (result as any).where = mockDbWhere;
      return result;
    });
    mockDbWhere.mockResolvedValue([]);
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
      const ownPersonal = makeSpace({ id: "s_own", type: "personal", ownerUserId: "admin_1" });
      const otherPersonal = makeSpace({ id: "s_other", type: "personal", ownerUserId: "other" });
      const spaces = [
        makeSpace({ id: "s1", type: "general" }),
        ownPersonal,
        otherPersonal,
        makeSpace({ id: "s3", type: "team", groupId: "g1" }),
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
      const ownPersonal = makeSpace({ id: "s2", type: "personal", ownerUserId: "user_1" });
      const otherPersonal = makeSpace({ id: "s3", type: "personal", ownerUserId: "other" });
      const teamSpace = makeSpace({ id: "s4", type: "team", groupId: "g1" });

      mockFindGeneralSpace.mockResolvedValue(generalSpace);
      mockFindPersonalSpaceByUserId.mockResolvedValue(ownPersonal);
      mockListSpaces.mockResolvedValue([generalSpace, ownPersonal, otherPersonal, teamSpace]);

      // db.select().from() calls:
      // 1. ensureTeamSpacesForAllGroups: from(userGroups) -> thenable resolving to []
      // 2. listVisibleSpaces: from(userGroupMemberships).where(...) -> [{ groupId: "g1" }]
      // 3. listVisibleSpaces: from(spacePermissions).where(...) -> []
      let fromCallCount = 0;
      mockDbFrom.mockImplementation(() => {
        fromCallCount++;
        if (fromCallCount === 1) {
          // ensureTeamSpacesForAllGroups: no .where(), returns thenable
          const p = Promise.resolve([]);
          // biome-ignore lint/suspicious/noExplicitAny: mock chain
          (p as any).where = mockDbWhere;
          return p;
        }
        // subsequent calls use .where()
        return { where: mockDbWhere };
      });

      mockDbWhere
        .mockResolvedValueOnce([{ groupId: "g1" }]) // userGroupMemberships
        .mockResolvedValueOnce([]); // spacePermissions (no explicit perms)

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
      const existing = makeSpace({ type: "personal", ownerUserId: user.id });
      mockFindPersonalSpaceByUserId.mockResolvedValue(existing);

      const result = await getOrCreatePersonalSpace(user);

      expect(result).toBe(existing);
      expect(mockCreateSpace).not.toHaveBeenCalled();
    });

    it("creates personal space when none exists", async () => {
      const user = makeUser({ id: "user_1", name: "Alice" });
      mockFindPersonalSpaceByUserId.mockResolvedValue(null);
      const created = makeSpace({ type: "personal", ownerUserId: user.id, name: "Alice" });
      mockCreateSpace.mockResolvedValue(created);

      const result = await getOrCreatePersonalSpace(user);

      expect(result).toBe(created);
      expect(mockCreateSpace).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Alice",
          type: "personal",
          ownerUserId: "user_1",
        })
      );
    });

    it("handles race condition on create", async () => {
      const user = makeUser();
      mockFindPersonalSpaceByUserId.mockResolvedValueOnce(null);
      mockCreateSpace.mockRejectedValue(new Error("unique constraint"));
      const existing = makeSpace({ type: "personal", ownerUserId: user.id });
      mockFindPersonalSpaceByUserId.mockResolvedValueOnce(existing);

      const result = await getOrCreatePersonalSpace(user);

      expect(result).toBe(existing);
    });
  });

  describe("canAccessSpace", () => {
    it("grants admin access to any space", async () => {
      const admin = makeUser({ role: UserRole.Admin });
      const space = makeSpace({ type: "team", groupId: "g1" });

      const result = await canAccessSpace(admin, space as never);

      expect(result).toBe(true);
    });

    it("grants personal space read access to everyone", async () => {
      const owner = makeUser({ id: "user_owner" });
      const otherUser = makeUser({ id: "user_other" });
      const space = makeSpace({ type: "personal", ownerUserId: "user_owner" });

      expect(await canAccessSpace(owner, space as never, "read")).toBe(true);
      expect(await canAccessSpace(otherUser, space as never, "read")).toBe(true);
    });

    it("grants personal space write/delete only to owner", async () => {
      const owner = makeUser({ id: "user_owner" });
      const otherUser = makeUser({ id: "user_other" });
      const admin = makeUser({ id: "admin_1", role: UserRole.Admin });
      const space = makeSpace({ type: "personal", ownerUserId: "user_owner" });

      expect(await canAccessSpace(owner, space as never, "write")).toBe(true);
      expect(await canAccessSpace(owner, space as never, "delete")).toBe(true);
      expect(await canAccessSpace(otherUser, space as never, "write")).toBe(false);
      expect(await canAccessSpace(admin, space as never, "write")).toBe(false);
    });

    it("grants general space access via fallback when no explicit permissions", async () => {
      const user = makeUser();
      const space = makeSpace({ type: "general" });

      // userGroupMemberships returns empty
      mockDbWhere.mockResolvedValueOnce([]);

      const result = await canAccessSpace(user, space as never);

      expect(result).toBe(true);
    });

    it("uses space permissions when defined for user groups", async () => {
      const user = makeUser();
      const space = makeSpace({ id: "s1", type: "team", groupId: "g1" });

      // userGroupMemberships
      mockDbWhere.mockResolvedValueOnce([{ groupId: "g1" }]);
      // spacePermissions for this space & group
      const mockDbAndWhere = vi
        .fn()
        .mockResolvedValue([{ canRead: true, canWrite: false, canDelete: false }]);
      mockDbFrom.mockReturnValueOnce({ where: mockDbWhere }).mockReturnValueOnce({
        where: mockDbAndWhere,
      });

      const result = await canAccessSpace(user, space as never, "read");

      expect(result).toBe(true);
    });

    it("denies write access when permission is false", async () => {
      const user = makeUser();
      const space = makeSpace({ id: "s1", type: "team", groupId: "g1" });

      // userGroupMemberships
      mockDbWhere.mockResolvedValueOnce([{ groupId: "g1" }]);
      // spacePermissions
      const mockDbAndWhere = vi
        .fn()
        .mockResolvedValue([{ canRead: true, canWrite: false, canDelete: false }]);
      mockDbFrom.mockReturnValueOnce({ where: mockDbWhere }).mockReturnValueOnce({
        where: mockDbAndWhere,
      });

      const result = await canAccessSpace(user, space as never, "write");

      expect(result).toBe(false);
    });
  });
});
