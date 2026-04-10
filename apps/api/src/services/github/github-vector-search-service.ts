import { embedText, getEmbeddingConfig, isEmbeddingEnabled } from "../../ai/embeddings.js";
import type { SessionUser } from "../../lib/auth.js";
import { listMembershipsByUser } from "../../repositories/admin/admin-repository.js";
import {
  type GithubVectorSearchResult,
  getGithubFileById,
  getGithubRepoById,
  repoHasGroupAccess,
  searchGithubByVector,
  searchGithubByVectorWithAccessScope,
} from "../../repositories/github/github-repository.js";
import { getResolvedGithubSettings } from "../admin/github-settings-service.js";

export type { GithubVectorSearchResult };

async function getUserGroupIds(user: SessionUser): Promise<string[]> {
  const memberships = await listMembershipsByUser(user.id);
  return memberships.map((m) => m.groupId);
}

export async function searchGithubForUser(
  user: SessionUser,
  queryText: string,
  limit = 5
): Promise<GithubVectorSearchResult[]> {
  const settings = await getResolvedGithubSettings();
  if (!settings.enabled) return [];

  if (!(await isEmbeddingEnabled())) return [];

  const queryEmbedding = await embedText(queryText, {
    taskType: "RETRIEVAL_QUERY",
  });
  if (!queryEmbedding) return [];

  const { model: modelId } = await getEmbeddingConfig();
  const groupIds = await getUserGroupIds(user);

  try {
    return await searchGithubByVectorWithAccessScope(
      queryEmbedding,
      user.role,
      limit,
      modelId,
      groupIds
    );
  } catch (err) {
    console.warn("[github-search] Vector search failed:", err);
    try {
      return await searchGithubByVectorWithAccessScope(
        queryEmbedding,
        user.role,
        limit,
        undefined,
        groupIds
      );
    } catch {
      return [];
    }
  }
}

export async function searchGithubAsSystem(
  queryText: string,
  limit = 5
): Promise<GithubVectorSearchResult[]> {
  const settings = await getResolvedGithubSettings();
  if (!settings.enabled) return [];

  if (!(await isEmbeddingEnabled())) return [];

  const queryEmbedding = await embedText(queryText, {
    taskType: "RETRIEVAL_QUERY",
  });
  if (!queryEmbedding) return [];

  const { model: modelId } = await getEmbeddingConfig();

  try {
    return await searchGithubByVector(queryEmbedding, limit, modelId);
  } catch (err) {
    console.warn("[github-search] Vector search failed:", err);
    try {
      return await searchGithubByVector(queryEmbedding, limit);
    } catch {
      return [];
    }
  }
}

export interface GithubFileTextResult {
  fileId: string;
  fileName: string;
  filePath: string;
  repoOwner: string;
  repoName: string;
  repoBranch: string;
  text: string;
}

export async function readGithubFileText(
  fileId: string,
  user: SessionUser
): Promise<GithubFileTextResult | null> {
  const file = await getGithubFileById(fileId);
  if (!file) return null;

  const repo = await getGithubRepoById(file.repoId);
  if (!repo) return null;

  if (repo.accessScope === "admins" && user.role !== "admin") return null;

  if (repo.accessScope === "groups") {
    const groupIds = await getUserGroupIds(user);
    const hasAccess = await repoHasGroupAccess(repo.id, groupIds);
    if (!hasAccess && user.role !== "admin") return null;
  }

  const text = file.plainText;
  if (!text) return null;

  return {
    fileId: file.id,
    fileName: file.name,
    filePath: file.path,
    repoOwner: repo.owner,
    repoName: repo.name,
    repoBranch: repo.branch,
    text: text.slice(0, 8000),
  };
}
