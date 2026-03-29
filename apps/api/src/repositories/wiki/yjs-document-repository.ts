import { db } from "../../db/index.js";

export async function getYjsState(pageId: string): Promise<Buffer | null> {
  const row = await db
    .selectFrom("yjs_documents")
    .selectAll()
    .where("page_id", "=", pageId)
    .executeTakeFirst();
  if (!row) return null;
  return Buffer.from(row.state, "base64");
}

export async function upsertYjsState(pageId: string, state: Buffer): Promise<void> {
  const base64 = state.toString("base64");
  await db
    .insertInto("yjs_documents")
    .values({ page_id: pageId, state: base64, updated_at: new Date() })
    .onConflict((oc) => oc.column("page_id").doUpdateSet({ state: base64, updated_at: new Date() }))
    .execute();
}
