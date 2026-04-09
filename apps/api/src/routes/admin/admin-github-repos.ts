import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import {
  createGithubRepo,
  deleteGithubRepo,
  getGithubFileStats,
  getGithubRepoById,
  getRepoGroupIds,
  listGithubRepos,
  listSyncLogs,
  replaceRepoPermissions,
  updateGithubRepo,
} from "../../repositories/github/github-repository.js";
import { getResolvedGithubSettings } from "../../services/admin/github-settings-service.js";
import { fetchGitHub, getInstallationToken } from "../../services/github/github-api-client.js";
import {
  triggerAllReposReindex,
  triggerGithubRepoSync,
} from "../../services/github/github-sync-service.js";
import { listInstallationRepositoriesFromApi } from "../../services/github/github-webhook-handler.js";
import { createGithubRepoSchema, updateGithubRepoSchema } from "./schemas.js";

export const adminGithubReposRoutes = new Hono<AppEnv>();

adminGithubReposRoutes.get(
  "/github/repos",
  withErrorHandler("GITHUB_REPOS_LIST_FAILED", "Failed to list GitHub repos"),
  async (c) => {
    const repos = await listGithubRepos();
    const results: Array<Record<string, unknown>> = [];
    for (const repo of repos) {
      const stats = await getGithubFileStats(repo.id);
      results.push({ ...repo, stats });
    }
    return c.json(results);
  }
);

adminGithubReposRoutes.post(
  "/github/repos",
  zValidator("json", createGithubRepoSchema),
  withErrorHandler("GITHUB_REPO_CREATE_FAILED", "Failed to create GitHub repo"),
  async (c) => {
    const data = c.req.valid("json");
    const { groupIds, ...repoData } = data;
    const repo = await createGithubRepo(repoData);
    if (groupIds && groupIds.length > 0) {
      await replaceRepoPermissions(repo.id, groupIds);
    }
    return c.json(repo, 201);
  }
);

adminGithubReposRoutes.get(
  "/github/repos/:id",
  withErrorHandler("GITHUB_REPO_FETCH_FAILED", "Failed to fetch GitHub repo"),
  async (c) => {
    const id = c.req.param("id");
    const repo = await getGithubRepoById(id);
    if (!repo) return c.json({ error: "Not found" }, 404);
    const groupIds = await getRepoGroupIds(id);
    return c.json({ ...repo, groupIds });
  }
);

adminGithubReposRoutes.put(
  "/github/repos/:id",
  zValidator("json", updateGithubRepoSchema),
  withErrorHandler("GITHUB_REPO_UPDATE_FAILED", "Failed to update GitHub repo"),
  async (c) => {
    const id = c.req.param("id");
    const data = c.req.valid("json");
    const repo = await getGithubRepoById(id);
    if (!repo) return c.json({ error: "Not found" }, 404);
    const { groupIds, ...repoData } = data;
    await updateGithubRepo(id, repoData);
    if (groupIds !== undefined) {
      await replaceRepoPermissions(id, groupIds);
    }
    const updated = await getGithubRepoById(id);
    return c.json(updated);
  }
);

adminGithubReposRoutes.delete(
  "/github/repos/:id",
  withErrorHandler("GITHUB_REPO_DELETE_FAILED", "Failed to delete GitHub repo"),
  async (c) => {
    const id = c.req.param("id");
    await deleteGithubRepo(id);
    return c.json({ ok: true });
  }
);

adminGithubReposRoutes.post(
  "/github/repos/:id/sync",
  withErrorHandler("GITHUB_REPO_SYNC_FAILED", "Failed to trigger sync"),
  async (c) => {
    const id = c.req.param("id");
    const result = await triggerGithubRepoSync(id);
    return c.json(result);
  }
);

adminGithubReposRoutes.get(
  "/github/repos/:id/status",
  withErrorHandler("GITHUB_REPO_STATUS_FAILED", "Failed to get repo status"),
  async (c) => {
    const id = c.req.param("id");
    const repo = await getGithubRepoById(id);
    if (!repo) return c.json({ error: "Not found" }, 404);
    const stats = await getGithubFileStats(id);
    return c.json({ repo, stats });
  }
);

adminGithubReposRoutes.get(
  "/github/repos/:id/sync-logs",
  withErrorHandler("GITHUB_SYNC_LOGS_FAILED", "Failed to get sync logs"),
  async (c) => {
    const id = c.req.param("id");
    const repo = await getGithubRepoById(id);
    if (!repo) return c.json({ error: "Not found" }, 404);
    const logs = await listSyncLogs(id);
    return c.json(logs);
  }
);

adminGithubReposRoutes.post(
  "/github/reindex",
  withErrorHandler("GITHUB_REINDEX_FAILED", "Failed to trigger reindex"),
  async (c) => {
    const result = await triggerAllReposReindex();
    return c.json(result);
  }
);

adminGithubReposRoutes.get(
  "/github/installation/:installationId/repos",
  withErrorHandler("GITHUB_INSTALLATION_REPOS_FAILED", "Failed to list installation repos"),
  async (c) => {
    const installationId = parseInt(c.req.param("installationId"), 10);
    if (Number.isNaN(installationId)) {
      return c.json({ error: "Invalid installation ID" }, 400);
    }
    const repos = await listInstallationRepositoriesFromApi(installationId);
    return c.json(repos);
  }
);

adminGithubReposRoutes.post(
  "/github-settings/test",
  withErrorHandler("GITHUB_SETTINGS_TEST_FAILED", "Failed to test GitHub settings"),
  async (c) => {
    const settings = await getResolvedGithubSettings();
    if (!settings.enabled || !settings.appId || !settings.appPrivateKey) {
      return c.json({ ok: false, error: "GitHub App settings incomplete" }, 400);
    }
    try {
      const repos = await listGithubRepos();
      if (repos.length === 0) {
        return c.json({ ok: true, message: "Connected (no repos registered)" });
      }
      const firstRepo = repos[0];
      if (!firstRepo) {
        return c.json({ ok: true, message: "Connected (no repos registered)" });
      }
      const token = await getInstallationToken({
        appId: settings.appId,
        privateKey: settings.appPrivateKey,
        installationId: firstRepo.installationId,
      });
      const resp = await fetchGitHub(
        `/repos/${firstRepo.owner}/${firstRepo.name}`,
        token,
        firstRepo.installationId
      );
      if (resp.ok) {
        return c.json({ ok: true, message: "Connected" });
      }
      const data = await resp.json();
      return c.json({ ok: false, error: data.message ?? "Connection failed" }, 400);
    } catch (err) {
      return c.json(
        {
          ok: false,
          error: err instanceof Error ? err.message : "Connection failed",
        },
        400
      );
    }
  }
);
