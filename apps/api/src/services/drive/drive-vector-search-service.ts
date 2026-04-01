import { embedText, getEmbeddingDimensions, isEmbeddingEnabled } from "../../ai/embeddings.js";
import { db } from "../../db/index.js";
import {
  type DriveVectorSearchResult,
  getDriveFileChunks,
  searchDriveByVectorWithPermissions,
} from "../../repositories/drive/drive-repository.js";
import { getResolvedDriveSettings } from "../admin/drive-settings-service.js";

export type { DriveVectorSearchResult };

/**
 * Search Drive files via vector similarity, filtered by user permissions.
 */
export async function searchDriveForUser(
  userEmail: string,
  queryText: string,
  limit = 5
): Promise<DriveVectorSearchResult[]> {
  const settings = await getResolvedDriveSettings();
  if (!settings.enabled) return [];

  if (!(await isEmbeddingEnabled())) return [];

  const dimensions = await getEmbeddingDimensions();
  const queryEmbedding = await embedText(queryText, {
    taskType: "RETRIEVAL_QUERY",
    outputDimensionality: dimensions,
  });

  if (!queryEmbedding) return [];

  try {
    return await searchDriveByVectorWithPermissions(queryEmbedding, userEmail, limit);
  } catch (err) {
    console.warn("[drive-search] Vector search failed:", err);
    return [];
  }
}

/**
 * Read the full text of a Drive file by reassembling its indexed chunks.
 * Returns null if file not found or user has no permission.
 */
export async function readDriveFileText(
  fileId: string,
  userEmail: string
): Promise<{ fileName: string; text: string; webViewLink: string | null } | null> {
  const userDomain = userEmail.split("@")[1] ?? "";

  const permRow = await db
    .selectFrom("drive_files as df")
    .innerJoin("drive_file_permissions as dp", "dp.fileId", "df.id")
    .where("df.id", "=", fileId)
    .where("df.indexStatus", "=", "indexed")
    .where((eb) =>
      eb.or([
        eb("dp.permissionType", "=", "anyone"),
        eb.and([eb("dp.permissionType", "=", "domain"), eb("dp.domain", "=", userDomain)]),
        eb.and([eb("dp.permissionType", "=", "user"), eb("dp.email", "=", userEmail)]),
      ])
    )
    .select(["df.name as fileName", "df.webViewLink"])
    .executeTakeFirst();

  if (!permRow) return null;

  const chunks = await getDriveFileChunks(fileId);
  if (chunks.length === 0) return null;

  const text = chunks.map((c) => c.plainText).join("\n");

  return {
    fileName: permRow.fileName,
    text: text.slice(0, 8000), // cap to avoid blowing context
    webViewLink: permRow.webViewLink,
  };
}
