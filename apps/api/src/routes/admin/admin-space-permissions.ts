import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import {
  deleteSpacePermissionForGroup,
  getSpacePermissionsDetail,
  replaceSpacePermissions,
} from "../../services/admin/admin-service.js";
import { getSpaceById } from "../../services/wiki/space-service.js";
import { toAdminSpacePermissionsResponseDto } from "./dto.js";
import { replaceSpacePermissionsSchema } from "./schemas.js";

export const adminSpacePermissionRoutes = new Hono<AppEnv>();

type AdminSpacePermissionsResponse =
  import("@echolore/shared/contracts").AdminSpacePermissionsResponseDto;
type AdminSpacePermissionsUpdateResponse = { spaceId: string; updated: true };
type AdminSpacePermissionDeleteResponse = { success: true };

adminSpacePermissionRoutes.get(
  "/permissions/spaces/:spaceId",
  withErrorHandler("ADMIN_SPACE_PERMISSIONS_FETCH_FAILED", "Failed to fetch space permissions"),
  async (c): Promise<Response> => {
    const { spaceId } = c.req.param();
    const detail = await getSpacePermissionsDetail(spaceId);
    return c.json<AdminSpacePermissionsResponse>(toAdminSpacePermissionsResponseDto(detail));
  }
);

adminSpacePermissionRoutes.put(
  "/permissions/spaces/:spaceId",
  zValidator("json", replaceSpacePermissionsSchema),
  withErrorHandler("ADMIN_SPACE_PERMISSIONS_UPDATE_FAILED", "Failed to update space permissions"),
  async (c): Promise<Response> => {
    const { spaceId } = c.req.param();
    const data = c.req.valid("json");
    const space = await getSpaceById(spaceId);
    if (!space) {
      return jsonError(c, 404, "ADMIN_SPACE_NOT_FOUND", "Space not found");
    }
    await replaceSpacePermissions(spaceId, data.permissions);
    return c.json<AdminSpacePermissionsUpdateResponse>({ spaceId, updated: true });
  }
);

adminSpacePermissionRoutes.delete(
  "/permissions/spaces/:spaceId/groups/:groupId",
  withErrorHandler("ADMIN_SPACE_PERMISSION_DELETE_FAILED", "Failed to delete space permission"),
  async (c): Promise<Response> => {
    const { spaceId, groupId } = c.req.param();
    const deleted = await deleteSpacePermissionForGroup(spaceId, groupId);
    if (!deleted) {
      return jsonError(c, 404, "ADMIN_SPACE_PERMISSION_NOT_FOUND", "Space permission not found");
    }
    return c.json<AdminSpacePermissionDeleteResponse>({ success: true });
  }
);
