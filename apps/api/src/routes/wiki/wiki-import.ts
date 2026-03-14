import { Hono } from "hono";
import { jsonError } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { getPageById } from "../../repositories/wiki/wiki-repository.js";
import { getSpaceById } from "../../repositories/wiki/space-repository.js";
import { indexPage } from "../../services/wiki/embedding-service.js";
import { canAccessSpace } from "../../services/wiki/space-service.js";
import {
  importFile,
  ImportValidationError,
  IMPORT_MAX_FILE_SIZE,
  IMPORT_ALLOWED_EXTENSIONS,
} from "../../services/wiki/import-service.js";

export const wikiImportRoutes = new Hono<AppEnv>();

function getFileExtension(filename: string): string {
  return "." + filename.toLowerCase().split(".").pop();
}

wikiImportRoutes.post("/import", async (c) => {
  const user = c.get("user");
  if (!user?.id) {
    return jsonError(c, 401, "UNAUTHORIZED", "Unauthorized");
  }

  try {
    const formData = await c.req.formData();
    const file = formData.get("file");
    const spaceId = formData.get("spaceId");
    const parentId = formData.get("parentId");

    if (!(file instanceof File) || !file.name) {
      return jsonError(c, 400, "WIKI_IMPORT_NO_FILE", "A file is required");
    }
    if (!spaceId || typeof spaceId !== "string") {
      return jsonError(c, 400, "WIKI_IMPORT_NO_SPACE", "spaceId is required");
    }

    // Early-reject before reading the full body into memory
    if (!IMPORT_ALLOWED_EXTENSIONS.has(getFileExtension(file.name))) {
      return jsonError(c, 400, "WIKI_IMPORT_UNSUPPORTED", "Unsupported file type. Use .md, .typ, or .typst");
    }
    if (file.size > IMPORT_MAX_FILE_SIZE) {
      return jsonError(c, 400, "WIKI_IMPORT_TOO_LARGE", "File too large (max 5MB)");
    }

    // Authorise space
    const space = await getSpaceById(spaceId);
    if (!space) {
      return jsonError(c, 404, "WIKI_SPACE_NOT_FOUND", "Space not found");
    }
    if (!(await canAccessSpace(user, space, "write"))) {
      return jsonError(c, 403, "WIKI_SPACE_FORBIDDEN", "Cannot create pages in this space");
    }

    // Validate parent
    const resolvedParentId = typeof parentId === "string" && parentId ? parentId : null;
    if (resolvedParentId) {
      const parentPage = await getPageById(resolvedParentId);
      if (!parentPage) {
        return jsonError(c, 404, "WIKI_PARENT_NOT_FOUND", "Parent page not found");
      }
      if (parentPage.spaceId !== spaceId) {
        return jsonError(c, 400, "WIKI_PARENT_SPACE_MISMATCH", "Parent page must belong to the same space");
      }
    }

    // Import
    const buffer = await file.arrayBuffer();
    const result = await importFile(buffer, file.name, spaceId, resolvedParentId, user);

    void indexPage(result.page.id).catch((e) => console.error("indexPage error:", e));

    return c.json({ page: result.page, blocks: result.blocks }, 201);
  } catch (error) {
    console.error("Error importing file:", error);

    if (error instanceof ImportValidationError) {
      return jsonError(c, 400, "WIKI_IMPORT_VALIDATION", error.message);
    }
    return jsonError(c, 500, "WIKI_IMPORT_FAILED", "Failed to import file");
  }
});
