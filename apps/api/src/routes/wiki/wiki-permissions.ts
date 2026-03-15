import { UserRole } from "@corp-internal/shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import { extractRequestMeta, writeAuditLog } from "../../lib/audit.js";
import type { AppEnv } from "../../lib/auth.js";
import type { authorizePageResource } from "../../policies/authorization-policy.js";
import {
  deletePagePermission,
  getPageInheritance,
} from "../../repositories/admin/admin-repository.js";
import { getPageById } from "../../repositories/wiki/wiki-repository.js";
import {
  getPagePermissionsDetail,
  replacePageInheritance,
  replacePagePermissions,
} from "../../services/admin/admin-service.js";
import { setPagePermissionsSchema, updateInheritanceSchema } from "./schemas.js";

export const wikiPermissionRoutes = new Hono<AppEnv>();

/** Authorize that the caller is the page author or an admin (not just write-access holders). */
async function authorizePagePermissionAccess(
  c: Parameters<typeof authorizePageResource>[0],
  pageId: string
) {
  const user = c.get("user");
  const page = await getPageById(pageId);
  if (!page) return { error: jsonError(c, 404, "WIKI_PAGE_NOT_FOUND", "Page not found") };

  const allowed = user.role === UserRole.Admin || page.authorId === user.id;

  await writeAuditLog({
    actorUserId: user.id,
    actorEmail: user.email,
    action: allowed ? "authz.allowed" : "authz.denied",
    resourceType: "wiki-page-permissions",
    resourceId: pageId,
    metadata: {
      reason: allowed ? (user.role === UserRole.Admin ? "admin" : "owner") : "not-owner",
    },
    ...extractRequestMeta(c),
  });

  if (!allowed) {
    return { error: jsonError(c, 403, "WIKI_PAGE_FORBIDDEN", "Forbidden") };
  }

  return { error: null };
}

wikiPermissionRoutes.get(
  "/:id/permissions",
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();
      const { error } = await authorizePagePermissionAccess(c, id);
      if (error) return error;

      return c.json(await getPagePermissionsDetail(id));
    },
    "WIKI_PAGE_PERMISSIONS_FETCH_FAILED",
    "Failed to fetch page permissions"
  )
);

wikiPermissionRoutes.put(
  "/:id/permissions",
  zValidator("json", setPagePermissionsSchema),
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();
      const data = c.req.valid("json");
      const { error } = await authorizePagePermissionAccess(c, id);
      if (error) return error;

      await replacePagePermissions(id, data.inheritFromParent ?? true, data.permissions);
      return c.json({ pageId: id, inheritFromParent: data.inheritFromParent ?? true });
    },
    "WIKI_PAGE_PERMISSIONS_SET_FAILED",
    "Failed to set page permissions"
  )
);

wikiPermissionRoutes.delete(
  "/:id/permissions/groups/:groupId",
  withErrorHandler(
    async (c) => {
      const { id, groupId } = c.req.param();
      const { error } = await authorizePagePermissionAccess(c, id);
      if (error) return error;

      const deleted = await deletePagePermission(id, groupId);
      if (!deleted) {
        return jsonError(c, 404, "WIKI_PAGE_PERMISSION_NOT_FOUND", "Permission not found");
      }
      return c.json({ success: true });
    },
    "WIKI_PAGE_PERMISSION_DELETE_FAILED",
    "Failed to remove permission"
  )
);

wikiPermissionRoutes.get(
  "/:id/permissions/inherit",
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();
      const { error } = await authorizePagePermissionAccess(c, id);
      if (error) return error;

      const inherit = await getPageInheritance(id);
      return c.json({ pageId: id, inheritFromParent: inherit?.inheritFromParent ?? true });
    },
    "WIKI_PAGE_INHERITANCE_FETCH_FAILED",
    "Failed to fetch inheritance"
  )
);

wikiPermissionRoutes.put(
  "/:id/permissions/inherit",
  zValidator("json", updateInheritanceSchema),
  withErrorHandler(
    async (c) => {
      const { id } = c.req.param();
      const data = c.req.valid("json");
      const { error } = await authorizePagePermissionAccess(c, id);
      if (error) return error;

      await replacePageInheritance(id, data.inheritFromParent);
      return c.json({ pageId: id, inheritFromParent: data.inheritFromParent });
    },
    "WIKI_PAGE_INHERITANCE_SET_FAILED",
    "Failed to set inheritance"
  )
);
