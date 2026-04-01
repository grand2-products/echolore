import { sql } from "kysely";
import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import type { DriveFile, NewDriveFilePermission } from "../../db/schema.js";

// ─── Drive Files ──────────────────────────────────────────────────

export async function upsertDriveFile(
  file: Omit<DriveFile, "createdAt" | "updatedAt" | "lastIndexedAt" | "indexStatus" | "indexError">
): Promise<void> {
  await db
    .insertInto("drive_files")
    .values({
      ...file,
      indexStatus: "pending",
      indexError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        name: file.name,
        mimeType: file.mimeType,
        driveId: file.driveId,
        parentFolderId: file.parentFolderId,
        webViewLink: file.webViewLink,
        modifiedAt: file.modifiedAt,
        contentHash: file.contentHash,
        updatedAt: new Date(),
      })
    )
    .execute();
}

export async function getDriveFileById(id: string): Promise<DriveFile | null> {
  const row = await db
    .selectFrom("drive_files")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  return row ?? null;
}

export async function updateDriveFileIndexStatus(
  fileId: string,
  status: string,
  error?: string | null
): Promise<void> {
  await db
    .updateTable("drive_files")
    .set({
      indexStatus: status,
      indexError: error ?? null,
      lastIndexedAt: status === "indexed" ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where("id", "=", fileId)
    .execute();
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  await db.deleteFrom("drive_files").where("id", "=", fileId).execute();
}

export async function batchDeleteDriveFiles(fileIds: string[]): Promise<void> {
  if (fileIds.length === 0) return;
  await db.deleteFrom("drive_files").where("id", "in", fileIds).execute();
}

export async function listDriveFileIds(): Promise<string[]> {
  const rows = await db.selectFrom("drive_files").select("id").execute();
  return rows.map((r) => r.id);
}

// ─── Drive Embeddings ─────────────────────────────────────────────

export async function replaceDriveEmbeddings(
  fileId: string,
  embeddings: Array<{
    chunkIndex: number;
    plainText: string;
    embedding: number[];
    modelId: string;
    createdAt: Date;
    updatedAt: Date;
  }>
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("drive_embeddings").where("fileId", "=", fileId).execute();

    if (embeddings.length === 0) return;

    const rows = embeddings.map((e) => ({
      id: nanoid(),
      fileId,
      chunkIndex: e.chunkIndex,
      plainText: e.plainText,
      embedding: `[${e.embedding.join(",")}]`,
      modelId: e.modelId,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));

    await trx.insertInto("drive_embeddings").values(rows).execute();
  });
}

export async function getDriveFileChunks(
  fileId: string
): Promise<Array<{ chunkIndex: number; plainText: string }>> {
  return db
    .selectFrom("drive_embeddings")
    .select(["chunkIndex", "plainText"])
    .where("fileId", "=", fileId)
    .orderBy("chunkIndex", "asc")
    .execute();
}

export async function deleteDriveEmbeddingsByFileId(fileId: string): Promise<void> {
  await db.deleteFrom("drive_embeddings").where("fileId", "=", fileId).execute();
}

// ─── Drive File Permissions ───────────────────────────────────────

export async function replaceDriveFilePermissions(
  fileId: string,
  permissions: Array<Omit<NewDriveFilePermission, "id" | "createdAt">>
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("drive_file_permissions").where("fileId", "=", fileId).execute();

    if (permissions.length === 0) return;

    const rows = permissions.map((p) => ({
      id: nanoid(),
      fileId,
      permissionType: p.permissionType,
      email: p.email ?? null,
      domain: p.domain ?? null,
      role: p.role,
      createdAt: new Date(),
    }));

    await trx.insertInto("drive_file_permissions").values(rows).execute();
  });
}

// ─── Drive Vector Search ──────────────────────────────────────────

export interface DriveVectorSearchResult {
  fileId: string;
  fileName: string;
  webViewLink: string | null;
  chunkText: string;
  similarity: number;
}

export async function searchDriveByVectorWithPermissions(
  queryEmbedding: number[],
  userEmail: string,
  limit: number
): Promise<DriveVectorSearchResult[]> {
  const vectorStr = `[${queryEmbedding.join(",")}]`;
  const userDomain = userEmail.split("@")[1] ?? "";

  const results = await db
    .selectFrom("drive_embeddings as de")
    .innerJoin("drive_files as df", "df.id", "de.fileId")
    .innerJoin("drive_file_permissions as dp", "dp.fileId", "df.id")
    .where((eb) =>
      eb.or([
        eb("dp.permissionType", "=", "anyone"),
        eb.and([eb("dp.permissionType", "=", "domain"), eb("dp.domain", "=", userDomain)]),
        eb.and([eb("dp.permissionType", "=", "user"), eb("dp.email", "=", userEmail)]),
      ])
    )
    .where("df.indexStatus", "=", "indexed")
    .select([
      "df.id as fileId",
      "df.name as fileName",
      "df.webViewLink",
      "de.plainText as chunkText",
      sql<number>`1 - (de.embedding <=> ${vectorStr}::vector)`.as("similarity"),
    ])
    .orderBy(sql`de.embedding <=> ${vectorStr}::vector`)
    .limit(limit * 3) // over-fetch to allow dedup
    .execute();

  // Deduplicate by fileId, keep highest similarity
  const seen = new Set<string>();
  const deduped: DriveVectorSearchResult[] = [];
  for (const r of results) {
    if (seen.has(r.fileId)) continue;
    seen.add(r.fileId);
    deduped.push(r);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

// ─── Sync Status ──────────────────────────────────────────────────

export async function getDriveFileStats(): Promise<{
  total: number;
  indexed: number;
  pending: number;
  error: number;
  skipped: number;
}> {
  const rows = await db
    .selectFrom("drive_files")
    .select(["indexStatus", sql<number>`count(*)::int`.as("count")])
    .groupBy("indexStatus")
    .execute();

  const stats = { total: 0, indexed: 0, pending: 0, error: 0, skipped: 0 };
  for (const row of rows) {
    const count = Number(row.count);
    stats.total += count;
    if (row.indexStatus === "indexed") stats.indexed = count;
    else if (row.indexStatus === "pending") stats.pending = count;
    else if (row.indexStatus === "error") stats.error = count;
    else if (row.indexStatus === "skipped") stats.skipped = count;
  }
  return stats;
}
