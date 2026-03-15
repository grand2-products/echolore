import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { blocks, pages } from "../../db/schema.js";
import { generateSuggestions } from "./knowledge-suggestion-service.js";

const SCAN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let scanning = false;
let lastScanAt: Date = new Date(Date.now() - SCAN_INTERVAL_MS);

export function startKnowledgeScanLoop(intervalMs?: number): void {
  if (intervalHandle) return;
  const ms = intervalMs ?? SCAN_INTERVAL_MS;
  console.log(`[knowledge-scan] Periodic scan started (interval: ${ms}ms)`);
  intervalHandle = setInterval(() => {
    if (scanning) return;
    void runScan();
  }, ms);
}

export function stopKnowledgeScanLoop(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[knowledge-scan] Periodic scan stopped");
  }
}

async function runScan(): Promise<void> {
  scanning = true;
  const scanSince = lastScanAt;
  try {
    // Only process pages updated since last scan
    const recentPages = await db
      .select({
        id: pages.id,
        title: pages.title,
        spaceId: pages.spaceId,
      })
      .from(pages)
      .where(and(isNull(pages.deletedAt), gt(pages.updatedAt, scanSince)))
      .orderBy(desc(pages.updatedAt))
      .limit(10);

    if (recentPages.length === 0) return;

    for (const page of recentPages) {
      const pageBlocks = await db
        .select({ content: blocks.content, type: blocks.type })
        .from(blocks)
        .where(eq(blocks.pageId, page.id))
        .orderBy(blocks.sortOrder)
        .limit(20);

      const content = pageBlocks
        .map((b) => b.content ?? "")
        .filter(Boolean)
        .join("\n");

      if (content.length < 100) continue;

      await generateSuggestions({
        sourceType: "periodic_scan",
        sourceId: page.id,
        sourceSummary: `Wiki page scan: ${page.title}`,
        sourceContent: content,
        targetSpaceId: page.spaceId,
      });
    }

    lastScanAt = new Date();
    console.log(`[knowledge-scan] Scan completed at ${lastScanAt.toISOString()}`);
  } catch (err) {
    console.error("[knowledge-scan] Scan failed:", err);
  } finally {
    scanning = false;
  }
}
