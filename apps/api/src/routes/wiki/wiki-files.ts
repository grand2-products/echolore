import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { loadFile } from "../../lib/file-storage.js";
import { authorizePageResource } from "../../policies/authorization-policy.js";
import { getFileById } from "../../repositories/file/file-repository.js";
import { getPageById } from "../../services/wiki/wiki-service.js";

/** MIME types safe to serve inline (no script execution risk). */
const SAFE_INLINE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
  "application/pdf",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "video/mp4",
  "video/webm",
  "video/ogg",
]);

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

    const buffer = await loadFile(fileRecord.storagePath);
    const ct = fileRecord.contentType || "application/octet-stream";
    const disposition = SAFE_INLINE_TYPES.has(ct) ? "inline" : "attachment";

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": ct,
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(fileRecord.filename)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }
);
