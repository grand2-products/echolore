import { embedText, getEmbeddingConfig, isEmbeddingEnabled } from "../../ai/embeddings.js";
import type { GithubRepo } from "../../db/schema.js";
import {
  createSyncLog,
  deleteGithubFile,
  finishSyncLog,
  getGithubFileByPath,
  getGithubRepoByOwnerAndName,
  listGithubRepos,
  pruneRemovedFiles,
  replaceGithubEmbeddings,
  updateRepoStats,
  updateRepoSyncStatus,
  upsertGithubFile,
} from "../../repositories/github/github-repository.js";
import {
  getResolvedGithubSettings,
  type ResolvedGithubSettings,
} from "../admin/github-settings-service.js";
import { chunkText } from "../wiki/embedding-service.js";
import { fetchGitHub, getInstallationToken } from "./github-api-client.js";
import {
  extractCodeText,
  isCodeFile,
  isTargetFile,
  stripFrontmatter,
} from "./github-text-processor.js";

let schedulerTimer: ReturnType<typeof setTimeout> | null = null;

const MAX_FILES_PER_CYCLE = 100;

// Per-repo serialisation lock shared across all trigger sources
// (scheduler, manual, webhook). Prevents concurrent syncs on the same repo.
const repoSyncLocks = new Map<string, Promise<void>>();

function withRepoLock(repoKey: string, fn: () => Promise<void>): Promise<void> {
  const prev = repoSyncLocks.get(repoKey) ?? Promise.resolve();
  // Always run fn after prev settles (regardless of prev's success/failure)
  // so queued syncs are never blocked by a prior failure.
  const next = prev
    .catch(() => {})
    .then(() => fn())
    .finally(() => {
      if (repoSyncLocks.get(repoKey) === next) {
        repoSyncLocks.delete(repoKey);
      }
    });
  repoSyncLocks.set(repoKey, next);
  return next;
}

export function startGithubSyncScheduler(): void {
  if (schedulerTimer) return;
  scheduleNextGithubSync();
}

export function stopGithubSyncScheduler(): void {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
}

function scheduleNextGithubSync(): void {
  getResolvedGithubSettings()
    .then((settings) => {
      if (!settings.enabled) {
        schedulerTimer = setTimeout(scheduleNextGithubSync, 5 * 60 * 1000);
        return;
      }
      const intervalMs = settings.syncIntervalMinutes * 60 * 1000;
      schedulerTimer = setTimeout(() => {
        syncAllRepos()
          .catch((err) =>
            console.error(JSON.stringify({ event: "github.scheduler.error", error: String(err) }))
          )
          .finally(scheduleNextGithubSync);
      }, intervalMs);
    })
    .catch(() => {
      schedulerTimer = setTimeout(scheduleNextGithubSync, 5 * 60 * 1000);
    });
}

export async function triggerGithubRepoSync(repoId: string): Promise<{
  started: boolean;
  message: string;
}> {
  const { getGithubRepoById } = await import("../../repositories/github/github-repository.js");
  const repo = await getGithubRepoById(repoId);
  if (!repo) return { started: false, message: "Repository not found" };

  const repoKey = `${repo.owner}/${repo.name}`;
  void withRepoLock(repoKey, () => syncRepo(repo, false, "manual"))
    .then(() => console.log(JSON.stringify({ event: "github.sync.manual.done", repoId })))
    .catch((err) =>
      console.error(
        JSON.stringify({ event: "github.sync.manual.error", repoId, error: String(err) })
      )
    );
  return { started: true, message: "Sync started" };
}

export async function triggerAllReposReindex(): Promise<{
  started: boolean;
  message: string;
}> {
  void syncAllRepos(true)
    .then(() => console.log(JSON.stringify({ event: "github.reindex.done" })))
    .catch((err) =>
      console.error(JSON.stringify({ event: "github.reindex.error", error: String(err) }))
    );
  return { started: true, message: "Reindex started" };
}

async function syncAllRepos(forceReindex = false): Promise<void> {
  try {
    const settings = await getResolvedGithubSettings();
    if (!settings.enabled) return;

    const embeddingEnabled = await isEmbeddingEnabled();
    if (!embeddingEnabled) {
      console.warn("[github-sync] Embedding is disabled, skipping sync");
      return;
    }

    const repos = await listGithubRepos();
    for (const repo of repos) {
      const repoKey = `${repo.owner}/${repo.name}`;
      try {
        await withRepoLock(repoKey, () => syncRepo(repo, forceReindex, "scheduled"));
      } catch (err) {
        console.error(
          JSON.stringify({
            event: "github.sync.repo_error",
            repoId: repo.id,
            error: String(err),
          })
        );
        await updateRepoSyncStatus(repo.id, "error", String(err));
      }
    }
  } catch (err) {
    console.error(JSON.stringify({ event: "github.sync.fatal_error", error: String(err) }));
  }
}

async function syncRepo(
  repo: GithubRepo,
  forceReindex = false,
  trigger: "manual" | "scheduled" | "webhook" = "scheduled"
): Promise<void> {
  const startedAt = new Date();
  const logId = await createSyncLog({ repoId: repo.id, trigger, startedAt });
  const settings = await getResolvedGithubSettings();
  await updateRepoSyncStatus(repo.id, "syncing", null);

  try {
    const token = await getInstallationToken({
      appId: settings.appId,
      privateKey: settings.appPrivateKey,
      installationId: repo.installationId,
    });

    const treeResp = await fetchGitHub(
      `/repos/${repo.owner}/${repo.name}/git/trees/${repo.branch}?recursive=1`,
      token,
      repo.installationId
    );
    const treeData = await treeResp.json();

    if (!treeData.tree) {
      throw new Error(`Failed to fetch tree: ${treeData.message ?? "unknown error"}`);
    }

    if (treeData.truncated) {
      console.warn(
        JSON.stringify({
          event: "github.sync.tree_truncated",
          repoId: repo.id,
          treeSize: treeData.tree.length,
          message: "Repository tree was truncated by GitHub API; some files may be missed",
        })
      );
    }

    const extensions = repo.fileExtensions as string[] | undefined;
    const targetFiles = treeData.tree.filter(
      (item: { type?: string; path?: string; sha?: string }) =>
        item.type === "blob" && isTargetFile(item.path ?? "", repo.pathPrefix, extensions)
    );

    const seenPaths = new Set<string>(targetFiles.map((f: { path: string }) => f.path));
    let processedCount = 0;
    let addedCount = 0;
    let updatedCount = 0;

    for (const item of targetFiles) {
      const existing = await getGithubFileByPath(repo.id, item.path);

      if (!forceReindex && existing?.sha === item.sha) continue;

      if (processedCount >= MAX_FILES_PER_CYCLE) {
        console.log(
          JSON.stringify({
            event: "github.sync.batch_limit_reached",
            repoId: repo.id,
            processedCount,
            remaining: targetFiles.length - processedCount,
          })
        );
        break;
      }

      await syncFileFromGitHub(repo, item.path, settings, item.sha, token);
      if (!existing) addedCount++;
      else updatedCount++;
      processedCount++;
    }

    const removedCount = await pruneRemovedFiles(repo.id, seenPaths);
    await updateRepoStats(repo.id, seenPaths.size);
    await finishSyncLog(logId, "success", {
      filesProcessed: processedCount,
      filesAdded: addedCount,
      filesUpdated: updatedCount,
      filesRemoved: removedCount,
    });
  } catch (err) {
    await finishSyncLog(logId, "error", {
      errorMessage: String(err),
    });
    throw err;
  }
}

async function syncFileFromGitHub(
  repo: GithubRepo,
  path: string,
  settings?: ResolvedGithubSettings,
  sha?: string,
  token?: string
): Promise<void> {
  const resolved = settings ?? (await getResolvedGithubSettings());
  const authToken =
    token ??
    (await getInstallationToken({
      appId: resolved.appId,
      privateKey: resolved.appPrivateKey,
      installationId: repo.installationId,
    }));

  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const resp = await fetchGitHub(
    `/repos/${repo.owner}/${repo.name}/contents/${encodedPath}?ref=${repo.branch}`,
    authToken,
    repo.installationId
  );
  const data = await resp.json();

  if (Array.isArray(data) || data.type !== "file") return;
  if (!data.content || (data.encoding && data.encoding !== "base64")) return;

  const rawText = Buffer.from(data.content, "base64").toString("utf-8");

  const fileName = path.split("/").pop() ?? path;
  const fileSha = data.sha ?? sha ?? "";
  const fileSize = Buffer.byteLength(rawText, "utf-8");

  if (fileSize > resolved.maxFileSizeBytes) {
    await upsertGithubFile({
      repoId: repo.id,
      path,
      name: fileName,
      sha: fileSha,
      plainText: null,
      size: fileSize,
      lastModifiedAt: null,
      indexStatus: "skipped",
      indexError: "File too large",
    });
    return;
  }

  const text = isCodeFile(path) ? extractCodeText(rawText, path) : stripFrontmatter(rawText);
  const chunks = chunkText(text);
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
    await upsertGithubFile({
      repoId: repo.id,
      path,
      name: fileName,
      sha: fileSha,
      plainText: text,
      size: fileSize,
      lastModifiedAt: null,
      indexStatus: "skipped",
      indexError: "Embedding generation failed",
    });
    return;
  }

  const fileId = await upsertGithubFile({
    repoId: repo.id,
    path,
    name: fileName,
    sha: fileSha,
    plainText: text,
    size: fileSize,
    lastModifiedAt: null,
    indexStatus: "indexed",
    indexError: null,
  });

  await replaceGithubEmbeddings(fileId, embeddings);
}

// ─── Webhook Push Sync ─────────────────────────────────────────────

interface PushCommit {
  added: string[];
  modified: string[];
  removed: string[];
}

interface PushEventPayload {
  ref: string;
  forced?: boolean;
  repository: { full_name: string };
  commits: PushCommit[];
}

function extractTargetFiles(
  commits: PushCommit[],
  prefix: string,
  extensions?: string[]
): { upsert: string[]; removed: string[] } {
  const fileActions = new Map<string, "upsert" | "removed">();

  for (const commit of commits) {
    for (const path of [...commit.added, ...commit.modified]) {
      if (isTargetFile(path, prefix, extensions)) fileActions.set(path, "upsert");
    }
    for (const path of commit.removed) {
      if (isTargetFile(path, prefix, extensions)) fileActions.set(path, "removed");
    }
  }

  const upsert: string[] = [];
  const removed: string[] = [];
  for (const [path, action] of fileActions) {
    (action === "upsert" ? upsert : removed).push(path);
  }
  return { upsert, removed };
}

async function triggerGithubPushSync(payload: PushEventPayload): Promise<void> {
  const repo = await getGithubRepoByOwnerAndName(payload.repository.full_name);
  if (!repo) return;

  const pushBranch = payload.ref.replace("refs/heads/", "");
  if (pushBranch !== repo.branch) return;

  if (payload.forced || payload.commits.length >= 20) {
    console.log(
      JSON.stringify({
        event: "github.webhook.fallback_to_full_sync",
        repoId: repo.id,
        reason: payload.forced ? "force_push" : "too_many_commits",
        commitCount: payload.commits.length,
      })
    );
    await syncRepo(repo, false, "webhook");
    return;
  }

  const extensions = repo.fileExtensions as string[] | undefined;
  const { upsert, removed } = extractTargetFiles(payload.commits, repo.pathPrefix, extensions);

  const settings = await getResolvedGithubSettings();

  for (const path of upsert) {
    try {
      await syncFileFromGitHub(repo, path, settings);
    } catch (err) {
      console.log(
        JSON.stringify({
          event: "github.sync.file_error",
          repoId: repo.id,
          path,
          error: String(err),
        })
      );
    }
  }
  for (const path of removed) {
    try {
      await deleteGithubFile(repo.id, path);
    } catch (err) {
      console.log(
        JSON.stringify({
          event: "github.sync.delete_error",
          repoId: repo.id,
          path,
          error: String(err),
        })
      );
    }
  }
}

export async function triggerGithubPushSyncSerialized(payload: PushEventPayload): Promise<void> {
  const repoKey = payload.repository.full_name;
  await withRepoLock(repoKey, () => triggerGithubPushSync(payload));
}
