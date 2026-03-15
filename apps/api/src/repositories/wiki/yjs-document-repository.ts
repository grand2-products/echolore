import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { yjsDocuments } from "../../db/schema.js";

export async function getYjsState(pageId: string): Promise<Buffer | null> {
  const [row] = await db.select().from(yjsDocuments).where(eq(yjsDocuments.pageId, pageId));
  if (!row) return null;
  return Buffer.from(row.state, "base64");
}

export async function upsertYjsState(pageId: string, state: Buffer): Promise<void> {
  const base64 = state.toString("base64");
  await db
    .insert(yjsDocuments)
    .values({ pageId, state: base64, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: yjsDocuments.pageId,
      set: { state: base64, updatedAt: new Date() },
    });
}
