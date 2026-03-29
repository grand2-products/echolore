import { UserRole } from "@echolore/shared/contracts";
import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { indexPage } from "../../services/wiki/embedding-service.js";
import {
  getPageById,
  listDeletedPages,
  permanentDeletePage,
  restorePage,
} from "../../services/wiki/wiki-service.js";

export const wikiTrashRoutes = new Hono<AppEnv>();

wikiTrashRoutes.get(
  "/trash",
  withErrorHandler("WIKI_TRASH_LIST_FAILED", "Failed to fetch trash"),
  async (c) => {
    const user = c.get("user");

    const deletedPages = await listDeletedPages();
    const filtered =
      user.role === UserRole.Admin
        ? deletedPages
        : deletedPages.filter((p) => p.author_id === user.id);
    return c.json({ pages: filtered });
  }
);

wikiTrashRoutes.post(
  "/trash/:id/restore",
  withErrorHandler("WIKI_PAGE_RESTORE_FAILED", "Failed to restore page"),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get("user");

    const page = await getPageById(id);
    if (!page) {
      return jsonError(c, 404, "WIKI_PAGE_NOT_FOUND", "Page not found");
    }
    if (!page.deletedAt) {
      return jsonError(c, 400, "WIKI_PAGE_NOT_DELETED", "Page is not in trash");
    }

    // Only admin or the author can restore
    if (user.role !== UserRole.Admin && page.authorId !== user.id) {
      return jsonError(c, 403, "WIKI_PAGE_FORBIDDEN", "Forbidden");
    }

    const restored = await restorePage(id);
    void indexPage(id).catch((e) => console.error("indexPage error:", e));
    return c.json({ page: restored });
  }
);

wikiTrashRoutes.delete(
  "/trash/:id",
  withErrorHandler("WIKI_PAGE_DELETE_FAILED", "Failed to permanently delete page"),
  async (c) => {
    const { id } = c.req.param();
    const user = c.get("user");

    if (user.role !== UserRole.Admin) {
      return jsonError(c, 403, "WIKI_PAGE_FORBIDDEN", "Admin only");
    }

    const page = await getPageById(id);
    if (!page) {
      return jsonError(c, 404, "WIKI_PAGE_NOT_FOUND", "Page not found");
    }
    if (!page.deletedAt) {
      return jsonError(c, 400, "WIKI_PAGE_NOT_DELETED", "Page is not in trash");
    }

    await permanentDeletePage(id);
    return c.json({ success: true });
  }
);
