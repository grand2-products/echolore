import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { jsonError, tryCatchResponse, withErrorHandler } from "../../lib/api-error.js";
import { auditAction, extractRequestMeta, writeAuditLog } from "../../lib/audit.js";
import type { AppEnv } from "../../lib/auth.js";
import { authorizePageResource } from "../../policies/authorization-policy.js";
import { deletePageEmbeddings, indexPage } from "../../services/wiki/embedding-service.js";
import {
  canAccessSpace,
  GENERAL_SPACE_ID,
  getSpaceById,
} from "../../services/wiki/space-service.js";
import {
  createPageRevision,
  createPageWithAccessDefaults,
  detectPageCycle,
  getPageBlocks,
  getPageById,
  listVisiblePages,
  searchVisiblePages,
  softDeletePage,
  updatePage,
} from "../../services/wiki/wiki-service.js";
import { createPageSchema, updatePageSchema } from "./schemas.js";

export const wikiPageRoutes = new Hono<AppEnv>();

wikiPageRoutes.get(
  "/",
  withErrorHandler("WIKI_PAGES_LIST_FAILED", "Failed to fetch pages"),
  async (c) => {
    const user = c.get("user");
    const spaceId = c.req.query("spaceId");

    const visiblePages = await listVisiblePages(user);
    const filtered = spaceId ? visiblePages.filter((p) => p.spaceId === spaceId) : visiblePages;
    return c.json({ pages: filtered });
  }
);

wikiPageRoutes.get(
  "/search",
  withErrorHandler("WIKI_SEARCH_FAILED", "Failed to search pages"),
  async (c) => {
    const query = c.req.query("q")?.trim();
    const semantic = c.req.query("semantic") !== "0";
    const user = c.get("user");

    const logSearch = async (
      resultCount: number,
      mode: "lexical" | "hybrid",
      semanticApplied: boolean
    ) => {
      await writeAuditLog({
        actorUserId: user?.id ?? null,
        actorEmail: user?.email ?? null,
        action: "search.query",
        resourceType: "wiki-search",
        metadata: { queryLength: query?.length ?? 0, resultCount, mode, semanticApplied },
        ...extractRequestMeta(c),
      });
    };

    if (!query) {
      return c.json({ pages: [] });
    }

    const result = await searchVisiblePages(user, query, semantic);
    await logSearch(result.pages.length, result.searchMeta.mode, result.searchMeta.semanticApplied);
    return c.json(result);
  }
);

wikiPageRoutes.get(
  "/:id",
  withErrorHandler("WIKI_PAGE_FETCH_FAILED", "Failed to fetch page"),
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

    const pageBlocks = await getPageBlocks(id);

    await auditAction(c, "wiki.page.view", "wiki-page", id, { blockCount: pageBlocks.length });

    return c.json({ page, blocks: pageBlocks });
  }
);

wikiPageRoutes.post("/", zValidator("json", createPageSchema), async (c) => {
  const user = c.get("user");

  if (!user?.id) {
    return jsonError(c, 401, "UNAUTHORIZED", "Unauthorized");
  }

  return tryCatchResponse(
    c,
    async () => {
      const data = c.req.valid("json");
      const user = c.get("user");
      const targetSpaceId = data.spaceId || GENERAL_SPACE_ID;

      // Verify user can access the target space
      const space = await getSpaceById(targetSpaceId);
      if (!space) {
        return jsonError(c, 404, "WIKI_SPACE_NOT_FOUND", "Space not found");
      }
      if (!(await canAccessSpace(user, space, "write"))) {
        return jsonError(c, 403, "WIKI_SPACE_FORBIDDEN", "Cannot create pages in this space");
      }

      // Verify parent page exists and belongs to the same space
      if (data.parentId) {
        const parentPage = await getPageById(data.parentId);
        if (!parentPage) {
          return jsonError(c, 404, "WIKI_PARENT_NOT_FOUND", "Parent page not found");
        }
        if (parentPage.spaceId !== targetSpaceId) {
          return jsonError(
            c,
            400,
            "WIKI_PARENT_SPACE_MISMATCH",
            "Parent page must belong to the same space"
          );
        }
      }

      const now = new Date();
      const newPage: Parameters<typeof createPageWithAccessDefaults>[0] = {
        id: crypto.randomUUID(),
        title: data.title,
        spaceId: targetSpaceId,
        parentId: data.parentId || null,
        authorId: user.id,
        createdAt: now,
        updatedAt: now,
      };

      const createdPage = await createPageWithAccessDefaults(newPage);
      if (!createdPage) {
        return jsonError(c, 500, "WIKI_PAGE_CREATE_FAILED", "Failed to create page");
      }
      return c.json({ page: createdPage }, 201);
    },
    "WIKI_PAGE_CREATE_FAILED",
    "Failed to create page"
  );
});

wikiPageRoutes.put(
  "/:id",
  zValidator("json", updatePageSchema),
  withErrorHandler("WIKI_PAGE_UPDATE_FAILED", "Failed to update page"),
  async (c) => {
    const { id } = c.req.param();
    const data = c.req.valid("json");

    const page = await getPageById(id);
    if (!page) {
      return jsonError(c, 404, "WIKI_PAGE_NOT_FOUND", "Page not found");
    }

    const authz = await authorizePageResource(c, id, page.authorId, "write");
    if (!authz.allowed) {
      return jsonError(c, 403, "WIKI_PAGE_FORBIDDEN", "Forbidden");
    }

    if (data.parentId !== undefined && data.parentId !== null) {
      const parentPage = await getPageById(data.parentId);
      if (!parentPage) {
        return jsonError(c, 404, "WIKI_PARENT_NOT_FOUND", "Parent page not found");
      }
      if (parentPage.spaceId !== page.spaceId) {
        return jsonError(
          c,
          400,
          "WIKI_PARENT_SPACE_MISMATCH",
          "Parent page must belong to the same space"
        );
      }
      const hasCycle = await detectPageCycle(id, data.parentId);
      if (hasCycle) {
        return jsonError(c, 409, "WIKI_PAGE_PARENT_CYCLE", "Circular parent reference detected");
      }
    }

    const updatePayload: { title?: string; parentId?: string | null; updatedAt: Date } = {
      updatedAt: new Date(),
    };

    if (data.title !== undefined) updatePayload.title = data.title;
    if (data.parentId !== undefined) updatePayload.parentId = data.parentId;

    const updatedPage = await updatePage(id, updatePayload);

    if (!updatedPage) {
      return jsonError(c, 404, "WIKI_PAGE_NOT_FOUND", "Page not found");
    }

    void indexPage(id).catch((e) => console.error("indexPage error:", e));
    return c.json({ page: updatedPage });
  }
);

wikiPageRoutes.delete(
  "/:id",
  withErrorHandler("WIKI_PAGE_DELETE_FAILED", "Failed to delete page"),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get("user");

    const page = await getPageById(id);
    if (!page) {
      return jsonError(c, 404, "WIKI_PAGE_NOT_FOUND", "Page not found");
    }

    const authz = await authorizePageResource(c, id, page.authorId, "delete");
    if (!authz.allowed) {
      return jsonError(c, 403, "WIKI_PAGE_FORBIDDEN", "Forbidden");
    }

    // Snapshot before soft-deleting (best-effort — don't block delete on snapshot failure)
    try {
      await createPageRevision(id, user.id);
    } catch (snapshotError) {
      console.warn(
        "[wiki] Snapshot before delete failed, proceeding with soft-delete:",
        snapshotError
      );
    }
    await softDeletePage(id);
    void deletePageEmbeddings(id).catch((e) => console.error("deletePageEmbeddings error:", e));
    return c.json({ success: true });
  }
);
