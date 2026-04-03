import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import {
  sanitizeBlockContent,
  sanitizeBlockProperties,
  sanitizeBlockType,
} from "../../lib/sanitize-block.js";
import { authorizePageResource } from "../../policies/authorization-policy.js";
import { indexPageBackground } from "../../services/wiki/embedding-service.js";
import type { NewBlock } from "../../services/wiki/wiki-service.js";
import {
  createBlock,
  deleteBlock,
  getBlockById,
  getPageById,
  updateBlock,
} from "../../services/wiki/wiki-service.js";
import { createBlockSchema, updateBlockSchema } from "./schemas.js";

export const wikiBlockRoutes = new Hono<AppEnv>();

wikiBlockRoutes.post(
  "/blocks",
  zValidator("json", createBlockSchema),
  withErrorHandler("WIKI_BLOCK_CREATE_FAILED", "Failed to create block"),
  async (c) => {
    const data = c.req.valid("json");

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
      type: sanitizeBlockType(data.type),
      content: sanitizeBlockContent(data.content),
      properties: sanitizeBlockProperties(data.properties) || null,
      sortOrder: data.sortOrder,
      createdAt: now,
      updatedAt: now,
    };

    const createdBlock = await createBlock(newBlock);
    if (!createdBlock) {
      return jsonError(c, 500, "WIKI_BLOCK_CREATE_FAILED", "Failed to create block");
    }
    indexPageBackground(data.pageId);
    return c.json({ block: createdBlock }, 201);
  }
);

wikiBlockRoutes.delete(
  "/blocks/:id",
  withErrorHandler("WIKI_BLOCK_DELETE_FAILED", "Failed to delete block"),
  async (c) => {
    const { id } = c.req.param();

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

    const deletedPageId = block.pageId;
    await deleteBlock(id);
    indexPageBackground(deletedPageId);

    return c.json({ success: true });
  }
);

wikiBlockRoutes.put(
  "/blocks/:id",
  zValidator("json", updateBlockSchema),
  withErrorHandler("WIKI_BLOCK_UPDATE_FAILED", "Failed to update block"),
  async (c) => {
    const { id } = c.req.param();
    const data = c.req.valid("json");

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

    if (data.type !== undefined) updatePayload.type = sanitizeBlockType(data.type);
    if (data.content !== undefined) updatePayload.content = sanitizeBlockContent(data.content);
    if (data.properties !== undefined)
      updatePayload.properties = sanitizeBlockProperties(data.properties);
    if (data.sortOrder !== undefined) updatePayload.sortOrder = data.sortOrder;

    const updatedBlock = await updateBlock(id, updatePayload);

    if (!updatedBlock) {
      return jsonError(c, 404, "WIKI_BLOCK_NOT_FOUND", "Block not found");
    }

    indexPageBackground(block.pageId);
    return c.json({ block: updatedBlock });
  }
);
