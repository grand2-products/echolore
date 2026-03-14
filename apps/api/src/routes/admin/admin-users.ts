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
import { updateUserGroupsSchema, updateUserRoleSchema } from "./schemas.js";

export const adminUserRoutes = new Hono<AppEnv>();

adminUserRoutes.get("/users", withErrorHandler(async (c) => {
  const { limit, offset } = parsePaginationParams(c);
  const all = await listUsersWithGroups();
  return c.json({ users: all.slice(offset, offset + limit), total: all.length });
}, "ADMIN_USERS_LIST_FAILED", "Failed to fetch users"));

adminUserRoutes.put("/users/:id/role", zValidator("json", updateUserRoleSchema), withErrorHandler(async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");
  const user = await changeUserRole(id, data.role);
  if (!user) return jsonError(c, 404, "ADMIN_USER_NOT_FOUND", "User not found");
  return c.json({ user });
}, "ADMIN_USER_ROLE_UPDATE_FAILED", "Failed to update user role"));

adminUserRoutes.put("/users/:id/groups", zValidator("json", updateUserGroupsSchema), withErrorHandler(async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");
  await replaceUserGroups(id, data.groupIds);
  return c.json({ success: true, groupIds: data.groupIds });
}, "ADMIN_USER_GROUPS_UPDATE_FAILED", "Failed to update user groups"));
