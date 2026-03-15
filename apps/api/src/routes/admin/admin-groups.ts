import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { parsePaginationParams } from "../../lib/pagination.js";
import {
  createGroup,
  deleteGroup,
  deleteMembership,
  getGroupById,
  getGroupByName,
  updateGroup as updateGroupRecord,
} from "../../repositories/admin/admin-repository.js";
import {
  addGroupMembers,
  getGroupDetail,
  listGroupMembers,
  listGroupsWithMemberCounts,
} from "../../services/admin/admin-service.js";
import { ensureTeamSpaceForGroup } from "../../services/wiki/space-service.js";
import { toAdminGroupDetailDto, toAdminGroupDto } from "./dto.js";
import { addMembersSchema, createGroupSchema, updateGroupSchema } from "./schemas.js";

export const adminGroupRoutes = new Hono<AppEnv>();

type AdminGroupsListResponse = {
  groups: import("@echolore/shared/contracts").AdminGroupDto[];
  total: number;
};
type AdminGroupResponse = { group: import("@echolore/shared/contracts").AdminGroupDto };
type AdminGroupDetailResponse = { group: import("@echolore/shared/contracts").AdminGroupDetailDto };
type AdminGroupDeleteResponse = { success: true };
type AdminGroupMembersListResponse = { members: Awaited<ReturnType<typeof listGroupMembers>> };
type AdminGroupMembersAddResponse = {
  added: number;
  memberships: Awaited<ReturnType<typeof addGroupMembers>>;
};
type AdminMembershipDeleteResponse = { success: true };

adminGroupRoutes.get(
  "/groups",
  withErrorHandler("ADMIN_GROUPS_LIST_FAILED", "Failed to fetch groups"),
  async (c): Promise<Response> => {
    const { limit, offset } = parsePaginationParams(c);
    const all = await listGroupsWithMemberCounts();
    return c.json<AdminGroupsListResponse>({
      groups: all.slice(offset, offset + limit).map(toAdminGroupDto),
      total: all.length,
    });
  }
);

adminGroupRoutes.post(
  "/groups",
  zValidator("json", createGroupSchema),
  withErrorHandler("ADMIN_GROUP_CREATE_FAILED", "Failed to create group"),
  async (c): Promise<Response> => {
    const data = c.req.valid("json");
    const exists = await getGroupByName(data.name);
    if (exists) {
      return jsonError(c, 400, "ADMIN_GROUP_NAME_CONFLICT", "Group name already exists");
    }

    const now = new Date();
    const group = await createGroup({
      id: `group_${nanoid(12)}`,
      name: data.name,
      description: data.description ?? null,
      isSystem: false,
      permissions: data.permissions,
      createdAt: now,
      updatedAt: now,
    });

    if (group) {
      // Auto-create a team space for the new group
      await ensureTeamSpaceForGroup(group.id, group.name);
    }

    if (!group) return jsonError(c, 500, "ADMIN_GROUP_CREATE_FAILED", "Failed to create group");
    return c.json<AdminGroupResponse>({ group: toAdminGroupDto(group) }, 201);
  }
);

adminGroupRoutes.get(
  "/groups/:id",
  withErrorHandler("ADMIN_GROUP_FETCH_FAILED", "Failed to fetch group"),
  async (c): Promise<Response> => {
    const { id } = c.req.param();
    const group = await getGroupDetail(id);
    if (!group) return jsonError(c, 404, "ADMIN_GROUP_NOT_FOUND", "Group not found");
    return c.json<AdminGroupDetailResponse>({ group: toAdminGroupDetailDto(group) });
  }
);

adminGroupRoutes.put(
  "/groups/:id",
  zValidator("json", updateGroupSchema),
  withErrorHandler("ADMIN_GROUP_UPDATE_FAILED", "Failed to update group"),
  async (c): Promise<Response> => {
    const { id } = c.req.param();
    const data = c.req.valid("json");
    const group = await getGroupById(id);
    if (!group) return jsonError(c, 404, "ADMIN_GROUP_NOT_FOUND", "Group not found");
    if (group.isSystem) {
      return jsonError(
        c,
        403,
        "ADMIN_GROUP_SYSTEM_MUTATION_FORBIDDEN",
        "Cannot modify system groups"
      );
    }

    if (data.name && data.name !== group.name) {
      const dupe = await getGroupByName(data.name);
      if (dupe) {
        return jsonError(c, 400, "ADMIN_GROUP_NAME_CONFLICT", "Group name already exists");
      }
    }

    const updated = await updateGroupRecord(id, {
      name: data.name ?? group.name,
      description: data.description ?? group.description,
      permissions: data.permissions ?? group.permissions,
      updatedAt: new Date(),
    });

    if (!updated) return jsonError(c, 404, "ADMIN_GROUP_NOT_FOUND", "Group not found");
    return c.json<AdminGroupResponse>({ group: toAdminGroupDto(updated) });
  }
);

adminGroupRoutes.delete(
  "/groups/:id",
  withErrorHandler("ADMIN_GROUP_DELETE_FAILED", "Failed to delete group"),
  async (c): Promise<Response> => {
    const { id } = c.req.param();
    const group = await getGroupById(id);
    if (!group) return jsonError(c, 404, "ADMIN_GROUP_NOT_FOUND", "Group not found");
    if (group.isSystem) {
      return jsonError(
        c,
        403,
        "ADMIN_GROUP_SYSTEM_DELETE_FORBIDDEN",
        "Cannot delete system groups"
      );
    }

    await deleteGroup(id);
    return c.json<AdminGroupDeleteResponse>({ success: true });
  }
);

adminGroupRoutes.get(
  "/groups/:id/members",
  withErrorHandler("ADMIN_GROUP_MEMBERS_LIST_FAILED", "Failed to fetch group members"),
  async (c): Promise<Response> => {
    const { id } = c.req.param();
    return c.json<AdminGroupMembersListResponse>({ members: await listGroupMembers(id) });
  }
);

adminGroupRoutes.post(
  "/groups/:id/members",
  zValidator("json", addMembersSchema),
  withErrorHandler("ADMIN_GROUP_MEMBERS_ADD_FAILED", "Failed to add members"),
  async (c): Promise<Response> => {
    const { id } = c.req.param();
    const data = c.req.valid("json");
    const inserted = await addGroupMembers(id, data.userIds);

    return c.json<AdminGroupMembersAddResponse>({ added: inserted.length, memberships: inserted });
  }
);

adminGroupRoutes.delete(
  "/groups/:id/members/:userId",
  withErrorHandler("ADMIN_MEMBERSHIP_DELETE_FAILED", "Failed to remove member"),
  async (c): Promise<Response> => {
    const { id, userId } = c.req.param();
    const deleted = await deleteMembership(id, userId);
    if (!deleted) {
      return jsonError(c, 404, "ADMIN_MEMBERSHIP_NOT_FOUND", "Membership not found");
    }
    return c.json<AdminMembershipDeleteResponse>({ success: true });
  }
);
