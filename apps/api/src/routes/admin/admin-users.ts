import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { parsePaginationParams } from "../../lib/pagination.js";
import {
  changeUserRole,
  listUsersWithGroups,
  replaceUserGroups,
  restoreUser,
  softDeleteUser,
  suspendUser,
  unsuspendUser,
} from "../../services/admin/admin-service.js";
import { toAdminUserRecordDto } from "./dto.js";
import { updateUserGroupsSchema, updateUserRoleSchema } from "./schemas.js";

export const adminUserRoutes = new Hono<AppEnv>();

type AdminUsersListResponse = {
  users: import("@echolore/shared/contracts").AdminUserRecordDto[];
  total: number;
};
type AdminUserRoleUpdateResponse = {
  user: import("@echolore/shared/contracts").AdminUserRecordDto;
};
type AdminUserGroupsUpdateResponse = { success: true; groupIds: string[] };

adminUserRoutes.get(
  "/users",
  withErrorHandler("ADMIN_USERS_LIST_FAILED", "Failed to fetch users"),
  async (c): Promise<Response> => {
    const { limit, offset } = parsePaginationParams(c);
    const all = await listUsersWithGroups();
    return c.json<AdminUsersListResponse>({
      users: all.slice(offset, offset + limit).map(toAdminUserRecordDto),
      total: all.length,
    });
  }
);

adminUserRoutes.put(
  "/users/:id/role",
  zValidator("json", updateUserRoleSchema),
  withErrorHandler("ADMIN_USER_ROLE_UPDATE_FAILED", "Failed to update user role"),
  async (c): Promise<Response> => {
    const { id } = c.req.param();
    const data = c.req.valid("json");
    const user = await changeUserRole(id, data.role);
    if (!user) return jsonError(c, 404, "ADMIN_USER_NOT_FOUND", "User not found");
    return c.json<AdminUserRoleUpdateResponse>({
      user: toAdminUserRecordDto({ ...user, groups: [] }),
    });
  }
);

adminUserRoutes.put(
  "/users/:id/groups",
  zValidator("json", updateUserGroupsSchema),
  withErrorHandler("ADMIN_USER_GROUPS_UPDATE_FAILED", "Failed to update user groups"),
  async (c): Promise<Response> => {
    const { id } = c.req.param();
    const data = c.req.valid("json");
    await replaceUserGroups(id, data.groupIds);
    return c.json<AdminUserGroupsUpdateResponse>({ success: true, groupIds: data.groupIds });
  }
);

type AdminUserActionResponse = {
  user: import("@echolore/shared/contracts").AdminUserRecordDto;
};

adminUserRoutes.post(
  "/users/:id/suspend",
  withErrorHandler("ADMIN_USER_SUSPEND_FAILED", "Failed to suspend user"),
  async (c): Promise<Response> => {
    const { id } = c.req.param();
    const me = c.get("user");
    if (id === me.id) {
      return jsonError(c, 400, "CANNOT_SUSPEND_SELF", "Cannot suspend yourself");
    }
    const user = await suspendUser(id);
    if (!user) return jsonError(c, 404, "ADMIN_USER_NOT_FOUND", "User not found");
    return c.json<AdminUserActionResponse>({
      user: toAdminUserRecordDto({ ...user, groups: [] }),
    });
  }
);

adminUserRoutes.post(
  "/users/:id/unsuspend",
  withErrorHandler("ADMIN_USER_UNSUSPEND_FAILED", "Failed to unsuspend user"),
  async (c): Promise<Response> => {
    const { id } = c.req.param();
    const user = await unsuspendUser(id);
    if (!user) return jsonError(c, 404, "ADMIN_USER_NOT_FOUND", "User not found");
    return c.json<AdminUserActionResponse>({
      user: toAdminUserRecordDto({ ...user, groups: [] }),
    });
  }
);

adminUserRoutes.delete(
  "/users/:id",
  withErrorHandler("ADMIN_USER_DELETE_FAILED", "Failed to delete user"),
  async (c): Promise<Response> => {
    const { id } = c.req.param();
    const me = c.get("user");
    if (id === me.id) {
      return jsonError(c, 400, "CANNOT_DELETE_SELF", "Cannot delete yourself");
    }
    const user = await softDeleteUser(id);
    if (!user) return jsonError(c, 404, "ADMIN_USER_NOT_FOUND", "User not found");
    return c.json<AdminUserActionResponse>({
      user: toAdminUserRecordDto({ ...user, groups: [] }),
    });
  }
);

adminUserRoutes.post(
  "/users/:id/restore",
  withErrorHandler("ADMIN_USER_RESTORE_FAILED", "Failed to restore user"),
  async (c): Promise<Response> => {
    const { id } = c.req.param();
    const user = await restoreUser(id);
    if (!user) return jsonError(c, 404, "ADMIN_USER_NOT_FOUND", "User not found");
    return c.json<AdminUserActionResponse>({
      user: toAdminUserRecordDto({ ...user, groups: [] }),
    });
  }
);
