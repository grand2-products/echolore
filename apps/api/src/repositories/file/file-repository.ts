import { db } from "../../db/index.js";
import type { File } from "../../db/schema.js";

export async function listFiles(): Promise<File[]> {
  return db.selectFrom("files").selectAll().execute();
}

export async function listFilesByUploader(uploaderId: string): Promise<File[]> {
  return db.selectFrom("files").selectAll().where("uploaderId", "=", uploaderId).execute();
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
