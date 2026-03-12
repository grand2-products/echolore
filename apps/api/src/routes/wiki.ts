import { Storage } from "@google-cloud/storage";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { NewBlock } from "../db/schema.js";
import { writeAuditLog } from "../lib/audit.js";
import { jsonError } from "../lib/api-error.js";
import type { AppEnv } from "../lib/auth.js";
import { authorizePageResource } from "../policies/authorization-policy.js";
import { getFileById } from "../repositories/file/file-repository.js";
import {
  createBlock,
  deleteBlock,
  deletePage,
  getBlockById,
  getPageBlocks,
  getPageById,
  updateBlock,
  updatePage,
} from "../repositories/wiki/wiki-repository.js";
import {
  createPageWithAccessDefaults,
  detectPageCycle,
  listVisiblePages,
  searchVisiblePages,
} from "../services/wiki/wiki-service.js";

export const wikiRoutes = new Hono<AppEnv>();
const storage = new Storage();
const bucketName = process.env.GCS_BUCKET || "corp-internal-files-dev";
const bucket = storage.bucket(bucketName);

const createPageSchema = z.object({
  title: z.string().min(1),
  parentId: z.string().optional(),
});

const updatePageSchema = z.object({
  title: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
});

const createBlockSchema = z.object({
  pageId: z.string(),
  type: z.string(),
  content: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
  sortOrder: z.number(),
});

const updateBlockSchema = z.object({
  type: z.string().optional(),
  content: z.string().nullable().optional(),
  properties: z.record(z.unknown()).nullable().optional(),
  sortOrder: z.number().optional(),
});

function getGcsObjectPath(gcsPath: string) {
  const pathMatch = gcsPath.match(/gs:\/\/[^/]+\/(.+)/);
  return pathMatch?.[1] ?? null;
}

function pageHasFileAttachment(blocks: Awaited<ReturnType<typeof getPageBlocks>>, fileId: string) {
  return blocks.some((block) => {
    if (block.type !== "file" || !block.properties || typeof block.properties !== "object") {
      return false;
    }

    const properties = block.properties as Record<string, unknown>;
    return properties.fileId === fileId;
  });
}

wikiRoutes.get("/", async (c) => {
  const user = c.get("user");

  try {
    const visiblePages = await listVisiblePages(user);
    return c.json({ pages: visiblePages });
  } catch (error) {
    console.error("Error fetching pages:", error);
    return jsonError(c, 500, "WIKI_PAGES_LIST_FAILED", "Failed to fetch pages");
  }
});

wikiRoutes.get("/search", async (c) => {
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
      ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    });
  };

  if (!query) {
    return c.json({ pages: [] });
  }

  try {
    const result = await searchVisiblePages(user, query, semantic);
    await logSearch(result.pages.length, result.searchMeta.mode, result.searchMeta.semanticApplied);
    return c.json(result);
  } catch (error) {
    console.error("Error searching pages:", error);
    return jsonError(c, 500, "WIKI_SEARCH_FAILED", "Failed to search pages");
  }
});

wikiRoutes.get("/:id/files/:fileId/download", async (c) => {
  const { id, fileId } = c.req.param();

  try {
    const page = await getPageById(id);
    if (!page) {
      return jsonError(c, 404, "WIKI_PAGE_NOT_FOUND", "Page not found");
    }

    const authz = await authorizePageResource(c, id, page.authorId, "read");
    if (!authz.allowed) {
      return jsonError(c, 403, "WIKI_PAGE_FORBIDDEN", "Forbidden");
    }

    const [pageBlocks, fileRecord] = await Promise.all([getPageBlocks(id), getFileById(fileId)]);

    if (!pageHasFileAttachment(pageBlocks, fileId)) {
      return jsonError(c, 404, "WIKI_FILE_NOT_ATTACHED", "File not attached to page");
    }

    if (!fileRecord) {
      return jsonError(c, 404, "WIKI_FILE_NOT_FOUND", "File not found");
    }

    const gcsPath = getGcsObjectPath(fileRecord.gcsPath);
    if (!gcsPath) {
      return jsonError(c, 500, "WIKI_FILE_PATH_INVALID", "Invalid file path");
    }

    const [signedUrl] = await bucket.file(gcsPath).getSignedUrl({
      action: "read",
      expires: Date.now() + 60 * 60 * 1000,
    });

    return c.redirect(signedUrl, 302);
  } catch (error) {
    console.error("Error resolving wiki file download:", error);
    return jsonError(c, 500, "WIKI_FILE_DOWNLOAD_RESOLVE_FAILED", "Failed to resolve wiki file download");
  }
});

wikiRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();
  const user = c.get("user");

  try {
    const page = await getPageById(id);
    if (!page) {
      return jsonError(c, 404, "WIKI_PAGE_NOT_FOUND", "Page not found");
    }

    const authz = await authorizePageResource(c, id, page.authorId, "read");
    if (!authz.allowed) {
      return jsonError(c, 403, "WIKI_PAGE_FORBIDDEN", "Forbidden");
    }

    const pageBlocks = await getPageBlocks(id);

    await writeAuditLog({
      actorUserId: user?.id ?? null,
      actorEmail: user?.email ?? null,
      action: "wiki.page.view",
      resourceType: "wiki-page",
      resourceId: id,
      metadata: { blockCount: pageBlocks.length },
      ipAddress: c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
    });

    return c.json({ page, blocks: pageBlocks });
  } catch (error) {
    console.error("Error fetching page:", error);
    return jsonError(c, 500, "WIKI_PAGE_FETCH_FAILED", "Failed to fetch page");
  }
});

wikiRoutes.post("/", zValidator("json", createPageSchema), async (c) => {
  const data = c.req.valid("json");
  const user = c.get("user");

  if (!user?.id) {
    return jsonError(c, 401, "UNAUTHORIZED", "Unauthorized");
  }

  try {
    const now = new Date();
    const newPage: Parameters<typeof createPageWithAccessDefaults>[0] = {
      id: crypto.randomUUID(),
      title: data.title,
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
  } catch (error) {
    console.error("Error creating page:", error);
    return jsonError(c, 500, "WIKI_PAGE_CREATE_FAILED", "Failed to create page");
  }
});

wikiRoutes.put("/:id", zValidator("json", updatePageSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");

  try {
    const page = await getPageById(id);
    if (!page) {
      return jsonError(c, 404, "WIKI_PAGE_NOT_FOUND", "Page not found");
    }

    const authz = await authorizePageResource(c, id, page.authorId, "write");
    if (!authz.allowed) {
      return jsonError(c, 403, "WIKI_PAGE_FORBIDDEN", "Forbidden");
    }

    if (data.parentId !== undefined && data.parentId !== null) {
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

    return c.json({ page: updatedPage });
  } catch (error) {
    console.error("Error updating page:", error);
    return jsonError(c, 500, "WIKI_PAGE_UPDATE_FAILED", "Failed to update page");
  }
});

wikiRoutes.delete("/:id", async (c) => {
  const { id } = c.req.param();

  try {
    const page = await getPageById(id);
    if (!page) {
      return jsonError(c, 404, "WIKI_PAGE_NOT_FOUND", "Page not found");
    }

    const authz = await authorizePageResource(c, id, page.authorId, "delete");
    if (!authz.allowed) {
      return jsonError(c, 403, "WIKI_PAGE_FORBIDDEN", "Forbidden");
    }

    await deletePage(id);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting page:", error);
    return jsonError(c, 500, "WIKI_PAGE_DELETE_FAILED", "Failed to delete page");
  }
});

wikiRoutes.post("/blocks", zValidator("json", createBlockSchema), async (c) => {
  const data = c.req.valid("json");

  try {
    const page = await getPageById(data.pageId);
    if (!page) {
      return jsonError(c, 404, "WIKI_PAGE_NOT_FOUND", "Page not found");
    }

    const authz = await authorizePageResource(c, page.id, page.authorId, "write");
    if (!authz.allowed) {
      return jsonError(c, 403, "WIKI_PAGE_FORBIDDEN", "Forbidden");
    }

    const now = new Date();
    const newBlock: NewBlock = {
      id: crypto.randomUUID(),
      pageId: data.pageId,
      type: data.type,
      content: data.content || null,
      properties: data.properties || null,
      sortOrder: data.sortOrder,
      createdAt: now,
      updatedAt: now,
    };

    const createdBlock = await createBlock(newBlock);
    if (!createdBlock) {
      return jsonError(c, 500, "WIKI_BLOCK_CREATE_FAILED", "Failed to create block");
    }
    return c.json({ block: createdBlock }, 201);
  } catch (error) {
    console.error("Error creating block:", error);
    return jsonError(c, 500, "WIKI_BLOCK_CREATE_FAILED", "Failed to create block");
  }
});

wikiRoutes.delete("/blocks/:id", async (c) => {
  const { id } = c.req.param();

  try {
    const block = await getBlockById(id);
    if (!block) {
      return jsonError(c, 404, "WIKI_BLOCK_NOT_FOUND", "Block not found");
    }

    const page = await getPageById(block.pageId);
    if (!page) {
      return jsonError(c, 404, "WIKI_PAGE_NOT_FOUND", "Page not found");
    }

    const authz = await authorizePageResource(c, page.id, page.authorId, "write");
    if (!authz.allowed) {
      return jsonError(c, 403, "WIKI_PAGE_FORBIDDEN", "Forbidden");
    }

    await deleteBlock(id);

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting block:", error);
    return jsonError(c, 500, "WIKI_BLOCK_DELETE_FAILED", "Failed to delete block");
  }
});

wikiRoutes.put("/blocks/:id", zValidator("json", updateBlockSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");

  try {
    const block = await getBlockById(id);
    if (!block) {
      return jsonError(c, 404, "WIKI_BLOCK_NOT_FOUND", "Block not found");
    }

    const page = await getPageById(block.pageId);
    if (!page) {
      return jsonError(c, 404, "WIKI_PAGE_NOT_FOUND", "Page not found");
    }

    const authz = await authorizePageResource(c, page.id, page.authorId, "write");
    if (!authz.allowed) {
      return jsonError(c, 403, "WIKI_PAGE_FORBIDDEN", "Forbidden");
    }

    const updatePayload: {
      type?: string;
      content?: string | null;
      properties?: Record<string, unknown> | null;
      sortOrder?: number;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (data.type !== undefined) updatePayload.type = data.type;
    if (data.content !== undefined) updatePayload.content = data.content;
    if (data.properties !== undefined) updatePayload.properties = data.properties;
    if (data.sortOrder !== undefined) updatePayload.sortOrder = data.sortOrder;

    const updatedBlock = await updateBlock(id, updatePayload);

    if (!updatedBlock) {
      return jsonError(c, 404, "WIKI_BLOCK_NOT_FOUND", "Block not found");
    }

    return c.json({ block: updatedBlock });
  } catch (error) {
    console.error("Error updating block:", error);
    return jsonError(c, 500, "WIKI_BLOCK_UPDATE_FAILED", "Failed to update block");
  }
});
