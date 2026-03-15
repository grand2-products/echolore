import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { files } from "../../db/schema.js";
import { firstOrNull } from "../../lib/db-utils.js";

export async function listFiles() {
  return db.select().from(files);
}

export async function listFilesByUploader(uploaderId: string) {
  return db.select().from(files).where(eq(files.uploaderId, uploaderId));
}

export async function getFileById(id: string) {
  return firstOrNull(await db.select().from(files).where(eq(files.id, id)));
}

export async function createFile(input: {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  storagePath: string;
  uploaderId: string;
  createdAt: Date;
}) {
  return firstOrNull(await db.insert(files).values(input).returning());
}

export async function deleteFile(id: string) {
  await db.delete(files).where(eq(files.id, id));
}
