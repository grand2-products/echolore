import { Hono } from "hono";
import { jsonError, tryCatchResponse, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { authorizePageResource } from "../../policies/authorization-policy.js";
import { indexPage } from "../../services/wiki/embedding-service.js";
import {
  createPageRevision,
  getPageById,
  getRevisionById,
  listRevisionsByPageId,
  restoreRevision,
} from "../../services/wiki/wiki-service.js";

export const wikiRevisionRoutes = new Hono<AppEnv>();

wikiRevisionRoutes.get(
  "/:id/revisions",
  withErrorHandler("WIKI_REVISIONS_LIST_FAILED", "Failed to list revisions"),
  async (c) => {
    const { id } = c.req.param();
    const page = await getPageById(id);
    if (!page) {
      return jsonError(c, 404, "WIKI_PAGE_NOT_FOUND", "Page not found");
    }
    const authz = await authorizePageResource(c, id, page.authorId, "read");
    if (!authz.allowed) {
      return jsonError(c, 403, "WIKI_PAGE_FORBIDDEN", "Forbidden");
    }
    const revisions = await listRevisionsByPageId(id);
    return c.json({ revisions });
  }
);

wikiRevisionRoutes.get(
  "/:id/revisions/:revisionId",
  withErrorHandler("WIKI_REVISION_FETCH_FAILED", "Failed to fetch revision"),
  async (c) => {
    const { id, revisionId } = c.req.param();
    const page = await getPageById(id);
    if (!page) {
      return jsonError(c, 404, "WIKI_PAGE_NOT_FOUND", "Page not found");
    }
    const authz = await authorizePageResource(c, id, page.authorId, "read");
    if (!authz.allowed) {
      return jsonError(c, 403, "WIKI_PAGE_FORBIDDEN", "Forbidden");
    }
    const revision = await getRevisionById(revisionId);
    if (!revision || revision.pageId !== id) {
      return jsonError(c, 404, "WIKI_REVISION_NOT_FOUND", "Revision not found");
    }
    return c.json({ revision });
  }
);

wikiRevisionRoutes.post("/:id/revisions", async (c) => {
  const user = c.get("user");
  if (!user?.id) {
    return jsonError(c, 401, "UNAUTHORIZED", "Unauthorized");
  }
  return tryCatchResponse(
    c,
    async () => {
      const { id } = c.req.param();
      const page = await getPageById(id);
      if (!page) {
        return jsonError(c, 404, "WIKI_PAGE_NOT_FOUND", "Page not found");
      }
      const authz = await authorizePageResource(c, id, page.authorId, "write");
      if (!authz.allowed) {
        return jsonError(c, 403, "WIKI_PAGE_FORBIDDEN", "Forbidden");
      }
      const revision = await createPageRevision(id, user.id);
      return c.json({ revision }, 201);
    },
    "WIKI_REVISION_CREATE_FAILED",
    "Failed to create revision"
  );
});

wikiRevisionRoutes.post("/:id/revisions/:revisionId/restore", async (c) => {
  const user = c.get("user");
  if (!user?.id) {
    return jsonError(c, 401, "UNAUTHORIZED", "Unauthorized");
  }
  return tryCatchResponse(
    c,
    async () => {
      const { id, revisionId } = c.req.param();
      const page = await getPageById(id);
      if (!page) {
        return jsonError(c, 404, "WIKI_PAGE_NOT_FOUND", "Page not found");
      }
      const authz = await authorizePageResource(c, id, page.authorId, "write");
      if (!authz.allowed) {
        return jsonError(c, 403, "WIKI_PAGE_FORBIDDEN", "Forbidden");
      }
      await restoreRevision(id, revisionId, user.id);
      void indexPage(id).catch((e) => console.error("indexPage error:", e));
      return c.json({ success: true });
    },
    "WIKI_REVISION_RESTORE_FAILED",
    "Failed to restore revision"
  );
});
