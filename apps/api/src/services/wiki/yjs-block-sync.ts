import * as Y from "yjs";
import { db } from "../../db/index.js";

const FRAGMENT_NAME = "document-store";

/**
 * Extract text content from a Yjs XmlFragment (BlockNote document-store)
 * and sync it to the blocks table so that lexical search can find it.
 *
 * BlockNote / y-prosemirror structure:
 *   XmlFragment("document-store")
 *     └ XmlElement("blockGroup")
 *         └ XmlElement("blockContainer") [attrs: blockType, ...]
 *             ├ XmlElement("paragraph" | "heading" | ...) ← content node
 *             │    └ XmlText("actual text")
 *             └ XmlElement("blockGroup") ← optional nested children
 */
export async function syncBlocksFromYDoc(pageId: string, doc: Y.Doc): Promise<void> {
  const fragment = doc.getXmlFragment(FRAGMENT_NAME);
  const extracted: ExtractedBlock[] = [];
  collectBlocks(fragment, extracted);

  const now = new Date();
  const blockValues = extracted.map((b, i) => ({
    id: `${pageId}-yjs-${i}`,
    pageId,
    type: b.type,
    content: b.content,
    sortOrder: i,
    createdAt: now,
    updatedAt: now,
  }));

  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("blocks").where("page_id", "=", pageId).execute();
    if (blockValues.length > 0) {
      await trx
        .insertInto("blocks")
        .values(
          blockValues.map((b) => ({
            id: b.id,
            page_id: b.pageId,
            type: b.type,
            content: b.content,
            sort_order: b.sortOrder,
            created_at: b.createdAt,
            updated_at: b.updatedAt,
          }))
        )
        .execute();
    }
  });
}

interface ExtractedBlock {
  type: string;
  content: string;
}

/**
 * Recursively walk the Yjs XML tree and collect blocks with their text content.
 * Handles the blockGroup → blockContainer → contentNode hierarchy.
 */
function collectBlocks(node: Y.XmlElement | Y.XmlFragment, out: ExtractedBlock[]): void {
  for (let i = 0; i < node.length; i++) {
    const child = node.get(i);
    if (!(child instanceof Y.XmlElement)) continue;

    const name = child.nodeName;

    if (name === "blockContainer") {
      // blockContainer holds the content element + optional nested blockGroup
      const blockType = child.getAttribute("blockType") || "paragraph";
      const text = extractAllText(child);
      if (text.trim()) {
        out.push({ type: blockType, content: text.trim() });
      }
    } else if (name === "blockGroup") {
      // blockGroup is a wrapper containing blockContainers
      collectBlocks(child, out);
    } else {
      // Fallback: could be a top-level content element or unknown structure
      const text = extractAllText(child);
      if (text.trim()) {
        out.push({ type: name || "paragraph", content: text.trim() });
      }
    }
  }
}

/**
 * Recursively extract all text content from a Yjs XmlElement.
 * XmlText.toString() returns the plain text without formatting attributes.
 */
function extractAllText(element: Y.XmlElement | Y.XmlFragment): string {
  const parts: string[] = [];

  for (let i = 0; i < element.length; i++) {
    const child = element.get(i);
    if (child instanceof Y.XmlText) {
      parts.push(child.toString());
    } else if (child instanceof Y.XmlElement) {
      // Skip nested blockGroup — those are handled by collectBlocks
      if (child.nodeName === "blockGroup") continue;
      parts.push(extractAllText(child));
    }
  }

  return parts.join(" ");
}

/**
 * Re-sync blocks for all pages that have Yjs state.
 * Used as a one-time migration / admin action to populate blocks
 * for pages that were edited via Yjs before this sync was added.
 */
export async function resyncAllYjsBlocks(): Promise<{ synced: number; errors: number }> {
  const rows = await db.selectFrom("yjs_documents").selectAll().execute();
  let synced = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const doc = new Y.Doc();
      Y.applyUpdate(doc, new Uint8Array(Buffer.from(row.state, "base64")));
      await syncBlocksFromYDoc(row.page_id, doc);
      doc.destroy();
      synced++;
    } catch (err) {
      errors++;
      console.error(`[yjs-block-sync] Failed to sync page ${row.page_id}:`, err);
    }
  }

  console.log(`[yjs-block-sync] Resync complete: ${synced} synced, ${errors} errors`);
  return { synced, errors };
}
