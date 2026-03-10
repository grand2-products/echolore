import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "../db/index.js";
import { pages, blocks, type NewPage, type NewBlock } from "../db/schema.js";
import { desc, eq, ilike } from "drizzle-orm";

export const wikiRoutes = new Hono();

// Validation schemas
const createPageSchema = z.object({
  title: z.string().min(1),
  parentId: z.string().optional(),
  authorId: z.string(),
});

const updatePageSchema = z.object({
  title: z.string().min(1).optional(),
});

const createBlockSchema = z.object({
  pageId: z.string(),
  type: z.string(),
  content: z.string().optional(),
  properties: z.record(z.unknown()).optional(),
  sortOrder: z.number(),
});

// GET /api/wiki - List all pages
wikiRoutes.get("/", async (c) => {
  try {
    const allPages = await db
      .select()
      .from(pages)
      .orderBy(desc(pages.updatedAt));
    
    return c.json({ pages: allPages });
  } catch (error) {
    console.error("Error fetching pages:", error);
    return c.json({ error: "Failed to fetch pages" }, 500);
  }
});

// GET /api/wiki/search - Search pages
wikiRoutes.get("/search", async (c) => {
  const query = c.req.query("q")?.trim();

  if (!query) {
    return c.json({ pages: [] });
  }

  try {
    const matchedPages = await db
      .select()
      .from(pages)
      .where(ilike(pages.title, `%${query}%`))
      .orderBy(desc(pages.updatedAt));

    return c.json({ pages: matchedPages });
  } catch (error) {
    console.error("Error searching pages:", error);
    return c.json({ error: "Failed to search pages" }, 500);
  }
});

// GET /api/wiki/:id - Get page with blocks
wikiRoutes.get("/:id", async (c) => {
  const { id } = c.req.param();
  
  try {
    const [page] = await db
      .select()
      .from(pages)
      .where(eq(pages.id, id));
    
    if (!page) {
      return c.json({ error: "Page not found" }, 404);
    }
    
    const pageBlocks = await db
      .select()
      .from(blocks)
      .where(eq(blocks.pageId, id))
      .orderBy(blocks.sortOrder);
    
    return c.json({ page, blocks: pageBlocks });
  } catch (error) {
    console.error("Error fetching page:", error);
    return c.json({ error: "Failed to fetch page" }, 500);
  }
});

// POST /api/wiki - Create new page
wikiRoutes.post("/", zValidator("json", createPageSchema), async (c) => {
  const data = c.req.valid("json");
  
  try {
    const id = crypto.randomUUID();
    const now = new Date();
    
    const newPage: NewPage = {
      id,
      title: data.title,
      parentId: data.parentId || null,
      authorId: data.authorId,
      createdAt: now,
      updatedAt: now,
    };
    
    const [createdPage] = await db
      .insert(pages)
      .values(newPage)
      .returning();
    
    return c.json({ page: createdPage }, 201);
  } catch (error) {
    console.error("Error creating page:", error);
    return c.json({ error: "Failed to create page" }, 500);
  }
});

// PUT /api/wiki/:id - Update page
wikiRoutes.put("/:id", zValidator("json", updatePageSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid("json");
  
  try {
    const [updatedPage] = await db
      .update(pages)
      .set({
        title: data.title,
        updatedAt: new Date(),
      })
      .where(eq(pages.id, id))
      .returning();
    
    if (!updatedPage) {
      return c.json({ error: "Page not found" }, 404);
    }
    
    return c.json({ page: updatedPage });
  } catch (error) {
    console.error("Error updating page:", error);
    return c.json({ error: "Failed to update page" }, 500);
  }
});

// DELETE /api/wiki/:id - Delete page
wikiRoutes.delete("/:id", async (c) => {
  const { id } = c.req.param();
  
  try {
    const [deletedPage] = await db
      .delete(pages)
      .where(eq(pages.id, id))
      .returning();
    
    if (!deletedPage) {
      return c.json({ error: "Page not found" }, 404);
    }
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting page:", error);
    return c.json({ error: "Failed to delete page" }, 500);
  }
});

// POST /api/wiki/blocks - Create block
wikiRoutes.post("/blocks", zValidator("json", createBlockSchema), async (c) => {
  const data = c.req.valid("json");
  
  try {
    const id = crypto.randomUUID();
    const now = new Date();
    
    const newBlock: NewBlock = {
      id,
      pageId: data.pageId,
      type: data.type,
      content: data.content || null,
      properties: data.properties || null,
      sortOrder: data.sortOrder,
      createdAt: now,
      updatedAt: now,
    };
    
    const [createdBlock] = await db
      .insert(blocks)
      .values(newBlock)
      .returning();
    
    return c.json({ block: createdBlock }, 201);
  } catch (error) {
    console.error("Error creating block:", error);
    return c.json({ error: "Failed to create block" }, 500);
  }
});

// DELETE /api/wiki/blocks/:id - Delete block
wikiRoutes.delete("/blocks/:id", async (c) => {
  const { id } = c.req.param();
  
  try {
    const [deletedBlock] = await db
      .delete(blocks)
      .where(eq(blocks.id, id))
      .returning();
    
    if (!deletedBlock) {
      return c.json({ error: "Block not found" }, 404);
    }
    
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting block:", error);
    return c.json({ error: "Failed to delete block" }, 500);
  }
});
