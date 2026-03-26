import { Hono } from "hono";
import type { AppEnv } from "../../lib/auth.js";
import { reindexAllPages } from "../../services/wiki/embedding-service.js";
import { resyncAllYjsBlocks } from "../../services/wiki/yjs-block-sync.js";

export const adminReindexRoutes = new Hono<AppEnv>();

adminReindexRoutes.post("/reindex-wiki", async (c) => {
  // Fire-and-forget: respond immediately, reindex in the background
  void reindexAllPages()
    .then((result) => console.log(JSON.stringify({ event: "admin.reindex-wiki.done", ...result })))
    .catch((error) => console.error("Reindex wiki failed:", error));
  return c.json({ success: true, message: "Reindex started in background" });
});

adminReindexRoutes.post("/resync-blocks", async (c) => {
  // Fire-and-forget: respond immediately, resync in the background
  void resyncAllYjsBlocks()
    .then((result) => console.log(JSON.stringify({ event: "admin.resync-blocks.done", ...result })))
    .catch((error) => console.error("Resync blocks failed:", error));
  return c.json({ success: true, message: "Block resync started in background" });
});
