import { GoogleAuth } from "google-auth-library";
import { type drive_v3, google } from "googleapis";
import { embedText, getEmbeddingConfig, isEmbeddingEnabled } from "../../ai/embeddings.js";
import {
  batchDeleteDriveFiles,
  getDriveFileById,
  getDriveFileStats,
  listDriveFileIds,
  replaceDriveEmbeddings,
  replaceDriveFilePermissions,
  updateDriveFileIndexStatus,
  upsertDriveFile,
} from "../../repositories/drive/drive-repository.js";
import { getResolvedDriveSettings } from "../admin/drive-settings-service.js";
import { getGcpCredentials } from "../admin/gcp-credentials-service.js";
import { chunkText } from "../wiki/embedding-service.js";
import { withBackoff } from "./drive-api-backoff.js";
import { extractTextFromDriveFile } from "./drive-text-extractor.js";

// ─── Sync state ───────────────────────────────────────────────────

let syncInProgress = false;
let lastSyncAt: Date | null = null;
let lastSyncResult: { indexed: number; skipped: number; errors: number } | null = null;

export async function getDriveSyncStatus() {
  const stats = await getDriveFileStats();
  return {
    syncInProgress,
    lastSyncAt: lastSyncAt?.toISOString() ?? null,
    lastSyncResult,
    files: stats,
  };
}

export async function triggerDriveSync(): Promise<{
  started: boolean;
  message: string;
}> {
  if (syncInProgress) {
    return { started: false, message: "Sync is already in progress" };
  }

  // Fire-and-forget; caller gets immediate response
  syncAllDrives().catch((err) => console.error("[drive-sync] Unhandled error:", err));

  return { started: true, message: "Drive sync started" };
}

// ─── Core sync logic ─────────────────────────────────────────────

async function createDriveClient(): Promise<drive_v3.Drive> {
  const creds = await getGcpCredentials();
  if (!creds.gcpServiceAccountKeyJson) {
    throw new Error("GCP service account key JSON is not configured");
  }

  const auth = new GoogleAuth({
    credentials: JSON.parse(creds.gcpServiceAccountKeyJson),
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  return google.drive({ version: "v3", auth });
}

async function syncAllDrives(): Promise<void> {
  syncInProgress = true;
  let indexed = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const settings = await getResolvedDriveSettings();
    if (!settings.enabled || settings.sharedDriveIds.length === 0) {
      return;
    }

    const embeddingEnabled = await isEmbeddingEnabled();
    if (!embeddingEnabled) {
      console.warn("[drive-sync] Embedding is disabled, skipping sync");
      return;
    }

    const drive = await createDriveClient();

    // Build MIME type query
    const mimeQuery = settings.includeMimeTypes.map((m) => `mimeType='${m}'`).join(" or ");

    // Track which file IDs we see in this sync (to prune deleted files)
    const seenFileIds = new Set<string>();

    for (const driveId of settings.sharedDriveIds) {
      try {
        const result = await syncSharedDrive(drive, driveId, mimeQuery, settings, seenFileIds);
        indexed += result.indexed;
        skipped += result.skipped;
        errors += result.errors;
      } catch (err) {
        console.error(`[drive-sync] Failed to sync drive ${driveId}:`, err);
        errors++;
      }
    }

    // Prune files that no longer exist in any synced drive
    await pruneDeletedFiles(seenFileIds);
  } catch (err) {
    console.error("[drive-sync] Fatal error:", err);
    errors++;
  } finally {
    syncInProgress = false;
    lastSyncAt = new Date();
    lastSyncResult = { indexed, skipped, errors };
    console.log(`[drive-sync] Completed: indexed=${indexed}, skipped=${skipped}, errors=${errors}`);
  }
}

async function syncSharedDrive(
  drive: drive_v3.Drive,
  driveId: string,
  mimeQuery: string,
  settings: Awaited<ReturnType<typeof getResolvedDriveSettings>>,
  seenFileIds: Set<string>
): Promise<{ indexed: number; skipped: number; errors: number }> {
  let indexed = 0;
  let skipped = 0;
  let errors = 0;

  let pageToken: string | undefined;

  do {
    const res = await withBackoff(
      () =>
        drive.files.list({
          corpora: "drive",
          driveId,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
          q: `(${mimeQuery}) and trashed=false`,
          fields:
            "nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum,webViewLink,parents,size)",
          pageSize: 100,
          pageToken,
        }),
      `files.list(${driveId})`
    );

    const files = res.data.files ?? [];
    pageToken = res.data.nextPageToken ?? undefined;

    for (const file of files) {
      if (!file.id || !file.name || !file.mimeType) continue;

      seenFileIds.add(file.id);

      // Skip excluded folders' children
      if (
        settings.excludeFolderIds.length > 0 &&
        file.parents?.some((p) => settings.excludeFolderIds.includes(p))
      ) {
        skipped++;
        continue;
      }

      // Skip oversized files
      const fileSize = Number(file.size ?? 0);
      if (fileSize > settings.maxFileSizeBytes && fileSize > 0) {
        await upsertDriveFile({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          driveId,
          parentFolderId: file.parents?.[0] ?? null,
          webViewLink: file.webViewLink ?? null,
          modifiedAt: file.modifiedTime ? new Date(file.modifiedTime) : null,
          contentHash: file.md5Checksum ?? file.modifiedTime ?? null,
        });
        await updateDriveFileIndexStatus(file.id, "skipped", "File too large");
        skipped++;
        continue;
      }

      try {
        const result = await syncSingleFile(drive, file, driveId);
        if (result === "indexed") indexed++;
        else if (result === "skipped") skipped++;
      } catch (err) {
        console.error(`[drive-sync] Failed to sync file ${file.id}:`, err);
        await updateDriveFileIndexStatus(
          file.id,
          "error",
          err instanceof Error ? err.message : "Unknown error"
        );
        errors++;
      }
    }
  } while (pageToken);

  return { indexed, skipped, errors };
}

async function syncSingleFile(
  drive: drive_v3.Drive,
  file: drive_v3.Schema$File,
  driveId: string
): Promise<"indexed" | "skipped"> {
  const fileId = file.id ?? "";
  const fileName = file.name ?? "";
  const fileMimeType = file.mimeType ?? "";
  const contentHash = file.md5Checksum ?? file.modifiedTime ?? null;

  // Check if content has changed BEFORE upserting (otherwise hash comparison is always true)
  const existingFile = await getDriveFileById(fileId);

  // Upsert file metadata
  await upsertDriveFile({
    id: fileId,
    name: fileName,
    mimeType: fileMimeType,
    driveId,
    parentFolderId: file.parents?.[0] ?? null,
    webViewLink: file.webViewLink ?? null,
    modifiedAt: file.modifiedTime ? new Date(file.modifiedTime) : null,
    contentHash,
  });

  // Sync permissions via dedicated API (files.list does not reliably return
  // permissions for shared drive files)
  await syncFilePermissions(drive, fileId);

  // Diff sync: skip re-indexing if content hash is unchanged
  if (
    existingFile?.indexStatus === "indexed" &&
    existingFile.contentHash === contentHash &&
    contentHash !== null
  ) {
    return "skipped";
  }

  // Extract text
  const text = await extractTextFromDriveFile(drive, fileId, fileMimeType);
  if (!text) {
    await updateDriveFileIndexStatus(fileId, "skipped", "No extractable text");
    return "skipped";
  }

  // Chunk + embed
  const chunks = chunkText(`${fileName}\n\n${text}`);
  const { model: modelId, dimensions } = await getEmbeddingConfig();
  const now = new Date();

  const embeddings: Array<{
    chunkIndex: number;
    plainText: string;
    embedding: number[];
    modelId: string;
    createdAt: Date;
    updatedAt: Date;
  }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunkStr = chunks[i];
    if (!chunkStr) continue;

    const vector = await embedText(chunkStr, {
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: dimensions,
    });

    if (vector) {
      embeddings.push({
        chunkIndex: i,
        plainText: chunkStr,
        embedding: vector,
        modelId,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  if (embeddings.length === 0) {
    await updateDriveFileIndexStatus(fileId, "skipped", "Embedding generation failed");
    return "skipped";
  }

  await replaceDriveEmbeddings(fileId, embeddings);
  await updateDriveFileIndexStatus(fileId, "indexed");

  return "indexed";
}

async function syncFilePermissions(drive: drive_v3.Drive, fileId: string): Promise<void> {
  const res = await withBackoff(
    () =>
      drive.permissions.list({
        fileId,
        supportsAllDrives: true,
        fields: "permissions(id,type,emailAddress,domain,role)",
      }),
    `permissions.list(${fileId})`
  );

  const permissions = (res.data.permissions ?? [])
    .filter((p): p is typeof p & { type: string; role: string } => Boolean(p.type && p.role))
    .map((p) => ({
      fileId,
      permissionType: p.type,
      email: p.emailAddress ?? null,
      domain: p.domain ?? null,
      role: p.role,
    }));

  await replaceDriveFilePermissions(fileId, permissions);
}

async function pruneDeletedFiles(seenFileIds: Set<string>): Promise<void> {
  const existingIds = await listDriveFileIds();
  const toDelete = existingIds.filter((id) => !seenFileIds.has(id));
  if (toDelete.length === 0) return;

  await batchDeleteDriveFiles(toDelete);
}
