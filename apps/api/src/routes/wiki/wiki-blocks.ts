import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { NewBlock } from "../../db/schema.js";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { authorizePageResource } from "../../policies/authorization-policy.js";
import {
  createBlock,
  deleteBlock,
  getBlockById,
  getPageById,
  updateBlock,
} from "../../repositories/wiki/wiki-repository.js";
import { indexPage } from "../../services/wiki/embedding-service.js";
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
    void indexPage(data.pageId).catch((e) => console.error("indexPage error:", e));
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
    void indexPage(deletedPageId).catch((e) => console.error("indexPage error:", e));

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

    if (data.type !== undefined) updatePayload.type = data.type;
    if (data.content !== undefined) updatePayload.content = data.content;
    if (data.properties !== undefined) updatePayload.properties = data.properties;
    if (data.sortOrder !== undefined) updatePayload.sortOrder = data.sortOrder;

    const updatedBlock = await updateBlock(id, updatePayload);

    if (!updatedBlock) {
      return jsonError(c, 404, "WIKI_BLOCK_NOT_FOUND", "Block not found");
    }

    void indexPage(block.pageId).catch((e) => console.error("indexPage error:", e));
    return c.json({ block: updatedBlock });
  }
);
