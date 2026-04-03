import { sql } from "kysely";
import { db } from "../../db/index.js";
import type { File } from "../../db/schema.js";

export async function listFiles(opts?: { limit?: number; offset?: number }): Promise<File[]> {
  let q = db.selectFrom("files").selectAll().orderBy("createdAt", "desc");
  if (opts?.limit) q = q.limit(opts.limit);
  if (opts?.offset) q = q.offset(opts.offset);
  return q.execute();
}

export async function listFilesByUploader(
  uploaderId: string,
  opts?: { limit?: number; offset?: number }
): Promise<File[]> {
  let q = db
    .selectFrom("files")
    .selectAll()
    .where("uploaderId", "=", uploaderId)
    .orderBy("createdAt", "desc");
  if (opts?.limit) q = q.limit(opts.limit);
  if (opts?.offset) q = q.offset(opts.offset);
  return q.execute();
}

export async function countFiles(): Promise<number> {
  const row = await db
    .selectFrom("files")
    .select(sql<number>`count(*)::int`.as("value"))
    .executeTakeFirst();
  return row?.value ?? 0;
}

export async function countFilesByUploader(uploaderId: string): Promise<number> {
  const row = await db
    .selectFrom("files")
    .select(sql<number>`count(*)::int`.as("value"))
    .where("uploaderId", "=", uploaderId)
    .executeTakeFirst();
  return row?.value ?? 0;
}

export async function getFileById(id: string): Promise<File | null> {
  return (await db.selectFrom("files").selectAll().where("id", "=", id).executeTakeFirst()) ?? null;
}

export async function createFile(input: {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  storagePath: string;
  uploaderId: string;
  createdAt: Date;
}): Promise<File | null> {
  return (
    (await db
      .insertInto("files")
      .values({
        id: input.id,
        filename: input.filename,
        contentType: input.contentType,
        size: input.size,
        storagePath: input.storagePath,
        uploaderId: input.uploaderId,
        createdAt: input.createdAt,
      })
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}

export async function deleteFile(id: string): Promise<void> {
  await db.deleteFrom("files").where("id", "=", id).execute();
}
