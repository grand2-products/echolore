import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { parsePaginationParams } from "../../lib/pagination.js";
import {
  changeUserRole,
  listUsersWithGroups,
  replaceUserGroups,
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
