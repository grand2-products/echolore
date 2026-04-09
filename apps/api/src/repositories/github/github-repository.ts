import { sql } from "kysely";
import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import type {
  GithubFile,
  GithubRepo,
  GithubRepoPermission,
  GithubSyncLog,
} from "../../db/schema.js";

// ─── Github Repos ──────────────────────────────────────────────────

export async function createGithubRepo(input: {
  owner: string;
  name: string;
  pathPrefix: string;
  installationId: number;
  branch: string;
  accessScope: string;
  fileExtensions?: string[];
}): Promise<GithubRepo> {
  const repo: GithubRepo = {
    id: nanoid(),
    owner: input.owner,
    name: input.name,
    pathPrefix: input.pathPrefix,
    installationId: input.installationId,
    branch: input.branch,
    accessScope: input.accessScope,
    fileExtensions: input.fileExtensions ?? ["md", "mdx"],
    lastSyncAt: null,
    syncStatus: "idle",
    syncError: null,
    fileCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await db.insertInto("github_repos").values(repo).execute();
  return repo;
}

export async function getGithubRepoById(id: string): Promise<GithubRepo | null> {
  const row = await db
    .selectFrom("github_repos")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  return row ?? null;
}

export async function getGithubRepoByOwnerAndName(fullName: string): Promise<GithubRepo | null> {
  const slashIdx = fullName.indexOf("/");
  if (slashIdx < 0) return null;
  const owner = fullName.slice(0, slashIdx);
  const name = fullName.slice(slashIdx + 1);
  if (!owner || !name) return null;
  const row = await db
    .selectFrom("github_repos")
    .selectAll()
    .where("owner", "=", owner)
    .where("name", "=", name)
    .executeTakeFirst();
  return row ?? null;
}

export async function listGithubRepos(): Promise<GithubRepo[]> {
  return db.selectFrom("github_repos").selectAll().orderBy("createdAt", "desc").execute();
}

export async function getGithubReposByInstallationId(
  installationId: number
): Promise<GithubRepo[]> {
  return db
    .selectFrom("github_repos")
    .selectAll()
    .where("installationId", "=", installationId)
    .execute();
}

export async function updateGithubRepo(
  id: string,
  input: {
    pathPrefix?: string;
    branch?: string;
    accessScope?: string;
    installationId?: number;
    fileExtensions?: string[];
  }
): Promise<void> {
  await db
    .updateTable("github_repos")
    .set({ ...input, updatedAt: new Date() })
    .where("id", "=", id)
    .execute();
}

export async function updateRepoInstallationId(id: string, installationId: number): Promise<void> {
  await db
    .updateTable("github_repos")
    .set({ installationId, updatedAt: new Date() })
    .where("id", "=", id)
    .execute();
}

export async function updateRepoSyncStatus(
  id: string,
  syncStatus: string,
  syncError: string | null
): Promise<void> {
  await db
    .updateTable("github_repos")
    .set({ syncStatus, syncError, updatedAt: new Date() })
    .where("id", "=", id)
    .execute();
}

export async function updateRepoStats(id: string, fileCount: number): Promise<void> {
  await db
    .updateTable("github_repos")
    .set({
      fileCount,
      lastSyncAt: new Date(),
      syncStatus: "idle",
      syncError: null,
      updatedAt: new Date(),
    })
    .where("id", "=", id)
    .execute();
}

export async function deleteGithubRepo(id: string): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("github_sync_logs").where("repoId", "=", id).execute();
    await trx.deleteFrom("github_repo_permissions").where("repoId", "=", id).execute();
    const fileIds = await trx
      .selectFrom("github_files")
      .select("id")
      .where("repoId", "=", id)
      .execute();
    if (fileIds.length > 0) {
      await trx
        .deleteFrom("github_embeddings")
        .where(
          "fileId",
          "in",
          fileIds.map((f) => f.id)
        )
        .execute();
    }
    await trx.deleteFrom("github_files").where("repoId", "=", id).execute();
    await trx.deleteFrom("github_repos").where("id", "=", id).execute();
  });
}

// ─── Github Files ──────────────────────────────────────────────────

export async function upsertGithubFile(input: {
  repoId: string;
  path: string;
  name: string;
  sha: string;
  plainText: string | null;
  size: number | null;
  lastModifiedAt: Date | null;
  indexStatus: string;
  indexError: string | null;
}): Promise<string> {
  const fileId = nanoid();
  const result = await db
    .insertInto("github_files")
    .values({
      id: fileId,
      repoId: input.repoId,
      path: input.path,
      name: input.name,
      sha: input.sha,
      plainText: input.plainText,
      size: input.size,
      lastModifiedAt: input.lastModifiedAt,
      lastIndexedAt: input.indexStatus === "indexed" ? new Date() : null,
      indexStatus: input.indexStatus,
      indexError: input.indexError,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflict((oc) =>
      oc.columns(["repoId", "path"]).doUpdateSet({
        name: input.name,
        sha: input.sha,
        plainText: input.plainText,
        size: input.size,
        lastModifiedAt: input.lastModifiedAt,
        lastIndexedAt: input.indexStatus === "indexed" ? new Date() : undefined,
        indexStatus: input.indexStatus,
        indexError: input.indexError,
        updatedAt: new Date(),
      })
    )
    .returning("id")
    .executeTakeFirstOrThrow();
  return result.id;
}

export async function getGithubFileById(id: string): Promise<GithubFile | null> {
  const row = await db
    .selectFrom("github_files")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  return row ?? null;
}

export async function getGithubFileByPath(
  repoId: string,
  path: string
): Promise<GithubFile | null> {
  const row = await db
    .selectFrom("github_files")
    .selectAll()
    .where("repoId", "=", repoId)
    .where("path", "=", path)
    .executeTakeFirst();
  return row ?? null;
}

export async function updateGithubFileIndexStatus(
  fileId: string,
  status: string,
  error?: string | null
): Promise<void> {
  await db
    .updateTable("github_files")
    .set({
      indexStatus: status,
      indexError: error ?? null,
      lastIndexedAt: status === "indexed" ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where("id", "=", fileId)
    .execute();
}

export async function deleteGithubFile(repoId: string, path: string): Promise<void> {
  await db
    .deleteFrom("github_files")
    .where("repoId", "=", repoId)
    .where("path", "=", path)
    .execute();
}

export async function pruneRemovedFiles(repoId: string, seenPaths: Set<string>): Promise<number> {
  const rows = await db
    .selectFrom("github_files")
    .select(["id", "path"])
    .where("repoId", "=", repoId)
    .execute();
  const toDelete = seenPaths.size === 0 ? rows : rows.filter((r) => !seenPaths.has(r.path));
  if (toDelete.length === 0) return 0;
  await db
    .deleteFrom("github_files")
    .where(
      "id",
      "in",
      toDelete.map((r) => r.id)
    )
    .execute();
  return toDelete.length;
}

export async function listGithubFileIdsByRepoId(repoId: string): Promise<string[]> {
  const rows = await db
    .selectFrom("github_files")
    .select("id")
    .where("repoId", "=", repoId)
    .execute();
  return rows.map((r) => r.id);
}

// ─── Github Embeddings ─────────────────────────────────────────────

export async function replaceGithubEmbeddings(
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
    await trx.deleteFrom("github_embeddings").where("fileId", "=", fileId).execute();
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
    await trx.insertInto("github_embeddings").values(rows).execute();
  });
}

// ─── Github Vector Search ──────────────────────────────────────────

export interface GithubVectorSearchResult {
  fileId: string;
  fileName: string;
  filePath: string;
  repoOwner: string;
  repoName: string;
  repoBranch: string;
  chunkText: string;
  similarity: number;
}

function mapToGithubVectorSearchResult(r: Record<string, unknown>): GithubVectorSearchResult {
  return {
    fileId: r.fileId as string,
    fileName: r.fileName as string,
    filePath: r.filePath as string,
    repoOwner: r.repoOwner as string,
    repoName: r.repoName as string,
    repoBranch: r.repoBranch as string,
    chunkText: r.chunkText as string,
    similarity: r.similarity as number,
  };
}

/**
 * Shared base query for GitHub vector search.
 * Over-fetches by `overFetchMultiplier` to compensate for deduplication and access filtering.
 */
function buildGithubVectorQuery(vectorStr: string, fetchLimit: number, modelId?: string) {
  return db
    .selectFrom("github_embeddings as ge")
    .innerJoin("github_files as gf", "gf.id", "ge.fileId")
    .innerJoin("github_repos as gr", "gr.id", "gf.repoId")
    .where("gf.indexStatus", "=", "indexed")
    .$if(!!modelId, (qb) => qb.where("ge.modelId", "=", modelId as string))
    .select([
      "gf.id as fileId",
      "gf.name as fileName",
      "gf.path as filePath",
      "gr.id as repoId",
      "gr.owner as repoOwner",
      "gr.name as repoName",
      "gr.branch as repoBranch",
      "gr.accessScope",
      "ge.plainText as chunkText",
      sql<number>`1 - (ge.embedding <=> ${vectorStr}::vector)`.as("similarity"),
    ])
    .orderBy(sql`ge.embedding <=> ${vectorStr}::vector`)
    .limit(fetchLimit);
}

function deduplicateResults(
  results: Array<Record<string, unknown>>,
  limit: number,
  filter?: (r: Record<string, unknown>) => boolean
): GithubVectorSearchResult[] {
  const seen = new Set<string>();
  const deduped: GithubVectorSearchResult[] = [];
  for (const r of results) {
    const mapped = mapToGithubVectorSearchResult(r);
    if (seen.has(mapped.fileId)) continue;
    seen.add(mapped.fileId);
    if (filter && !filter(r)) continue;
    deduped.push(mapped);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

export async function searchGithubByVectorWithAccessScope(
  queryEmbedding: number[],
  userRole: string,
  limit: number,
  modelId?: string,
  userGroupIds?: string[]
): Promise<GithubVectorSearchResult[]> {
  const vectorStr = `[${queryEmbedding.join(",")}]`;
  const groupSet = userGroupIds ? new Set(userGroupIds) : new Set<string>();

  // Over-fetch more aggressively to compensate for access scope filtering
  const results = await buildGithubVectorQuery(vectorStr, limit * 5, modelId)
    .where((eb) =>
      eb.or([
        eb("gr.accessScope", "=", "all_members"),
        eb("gr.accessScope", "=", "groups"),
        ...(userRole === "admin" ? [eb("gr.accessScope", "=", "admins")] : []),
      ])
    )
    .execute();

  const groupRepoIds =
    groupSet.size > 0
      ? new Set(
          (
            await db
              .selectFrom("github_repo_permissions")
              .select("repoId")
              .where("groupId", "in", [...groupSet])
              .execute()
          ).map((r) => r.repoId)
        )
      : new Set<string>();

  return deduplicateResults(results as unknown as Array<Record<string, unknown>>, limit, (r) => {
    const accessScope = r.accessScope as string;
    const repoId = r.repoId as string;
    if (accessScope === "admins" && userRole !== "admin") return false;
    if (accessScope === "groups" && !groupRepoIds.has(repoId)) return false;
    return true;
  });
}

export async function searchGithubByVector(
  queryEmbedding: number[],
  limit: number,
  modelId?: string
): Promise<GithubVectorSearchResult[]> {
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  const results = await buildGithubVectorQuery(vectorStr, limit * 3, modelId).execute();

  return deduplicateResults(results as unknown as Array<Record<string, unknown>>, limit);
}

// ─── Sync Stats ──────────────────────────────────────────────────

export async function getGithubFileStats(
  repoId: string
): Promise<{ total: number; indexed: number; pending: number; error: number; skipped: number }> {
  const rows = await db
    .selectFrom("github_files")
    .select(["indexStatus", sql<number>`count(*)::int`.as("count")])
    .where("repoId", "=", repoId)
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

// ─── Github Repo Permissions (Group-based) ────────────────────────────

export async function listRepoPermissions(repoId: string): Promise<GithubRepoPermission[]> {
  return db
    .selectFrom("github_repo_permissions")
    .selectAll()
    .where("repoId", "=", repoId)
    .execute();
}

export async function replaceRepoPermissions(repoId: string, groupIds: string[]): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("github_repo_permissions").where("repoId", "=", repoId).execute();
    if (groupIds.length === 0) return;
    const rows = groupIds.map((groupId) => ({
      id: nanoid(),
      repoId,
      groupId,
      createdAt: new Date(),
    }));
    await trx.insertInto("github_repo_permissions").values(rows).execute();
  });
}

export async function getRepoGroupIds(repoId: string): Promise<string[]> {
  const rows = await db
    .selectFrom("github_repo_permissions")
    .select("groupId")
    .where("repoId", "=", repoId)
    .execute();
  return rows.map((r) => r.groupId);
}

export async function repoHasGroupAccess(repoId: string, groupIds: string[]): Promise<boolean> {
  if (groupIds.length === 0) return false;
  const row = await db
    .selectFrom("github_repo_permissions")
    .select("id")
    .where("repoId", "=", repoId)
    .where("groupId", "in", groupIds)
    .executeTakeFirst();
  return !!row;
}

// ─── Github Sync Logs ──────────────────────────────────────────────────

export async function createSyncLog(input: {
  repoId: string;
  trigger: string;
  startedAt: Date;
}): Promise<string> {
  const id = nanoid();
  await db
    .insertInto("github_sync_logs")
    .values({
      id,
      repoId: input.repoId,
      trigger: input.trigger,
      status: "running",
      startedAt: input.startedAt,
    })
    .execute();
  return id;
}

export async function finishSyncLog(
  logId: string,
  status: string,
  result: {
    filesProcessed?: number;
    filesAdded?: number;
    filesUpdated?: number;
    filesRemoved?: number;
    errorMessage?: string | null;
  }
): Promise<void> {
  await db
    .updateTable("github_sync_logs")
    .set({
      status,
      filesProcessed: result.filesProcessed ?? 0,
      filesAdded: result.filesAdded ?? 0,
      filesUpdated: result.filesUpdated ?? 0,
      filesRemoved: result.filesRemoved ?? 0,
      errorMessage: result.errorMessage ?? null,
      finishedAt: new Date(),
    })
    .where("id", "=", logId)
    .execute();
}

export async function listSyncLogs(repoId: string, limit = 20): Promise<GithubSyncLog[]> {
  return db
    .selectFrom("github_sync_logs")
    .selectAll()
    .where("repoId", "=", repoId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .execute();
}
