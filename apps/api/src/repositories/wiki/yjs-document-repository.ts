import { db } from "../../db/index.js";

export async function getYjsState(pageId: string): Promise<Buffer | null> {
  const row = await db
    .selectFrom("yjs_documents")
    .selectAll()
    .where("pageId", "=", pageId)
    .executeTakeFirst();
  if (!row) return null;
  return Buffer.from(row.state, "base64");
}

export async function upsertYjsState(pageId: string, state: Buffer): Promise<void> {
  const base64 = state.toString("base64");
  await db
    .insertInto("yjs_documents")
    .values({ pageId: pageId, state: base64, updatedAt: new Date() })
    .onConflict((oc) => oc.column("pageId").doUpdateSet({ state: base64, updatedAt: new Date() }))
    .execute();
}
