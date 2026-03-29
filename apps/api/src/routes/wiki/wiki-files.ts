import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { loadFile } from "../../lib/file-storage.js";
import { authorizePageResource } from "../../policies/authorization-policy.js";
import { getFileById } from "../../services/file/file-service.js";
import { getPageById } from "../../services/wiki/wiki-service.js";

export const wikiFileRoutes = new Hono<AppEnv>();

wikiFileRoutes.get(
  "/:id/files/:fileId/download",
  withErrorHandler("WIKI_FILE_DOWNLOAD_RESOLVE_FAILED", "Failed to resolve wiki file download"),
  async (c) => {
    const { id, fileId } = c.req.param();

    const page = await getPageById(id);
    if (!page) {
      return jsonError(c, 404, "WIKI_PAGE_NOT_FOUND", "Page not found");
    }

    const authz = await authorizePageResource(c, id, page.authorId, "read");
    if (!authz.allowed) {
      return jsonError(c, 403, "WIKI_PAGE_FORBIDDEN", "Forbidden");
    }

    const fileRecord = await getFileById(fileId);
    if (!fileRecord) {
      return jsonError(c, 404, "WIKI_FILE_NOT_FOUND", "File not found");
    }

    const buffer = await loadFile(fileRecord.storage_path);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": fileRecord.content_type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(fileRecord.filename)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }
);
