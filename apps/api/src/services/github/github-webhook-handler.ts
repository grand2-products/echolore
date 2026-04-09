import {
  getGithubRepoByOwnerAndName,
  getGithubReposByInstallationId,
  updateRepoInstallationId,
  updateRepoSyncStatus,
} from "../../repositories/github/github-repository.js";
import { getResolvedGithubSettings } from "../admin/github-settings-service.js";
import { fetchGitHub, getInstallationToken } from "./github-api-client.js";

interface InstallationEventPayload {
  action: string;
  installation: { id: number };
  repositories?: Array<{ full_name: string }>;
}

interface InstallationRepositoriesEventPayload {
  installation?: { id: number };
  repositories_added?: Array<{ full_name: string }>;
  repositories_removed?: Array<{ full_name: string }>;
}

export async function handleInstallationEvent(payload: InstallationEventPayload): Promise<void> {
  if (payload.action === "created") {
    const existingRepos = payload.repositories ?? [];

    let allRepos = existingRepos;
    if (existingRepos.length === 0) {
      allRepos = await fetchInstallationRepositories(payload.installation.id);
    }

    for (const ghRepo of allRepos) {
      const repo = await getGithubRepoByOwnerAndName(ghRepo.full_name);
      if (repo && repo.installationId !== payload.installation.id) {
        await updateRepoInstallationId(repo.id, payload.installation.id);
        await updateRepoSyncStatus(repo.id, "idle", null);
        console.log(
          JSON.stringify({
            event: "github.installation.updated",
            repoId: repo.id,
            oldInstallationId: repo.installationId,
            newInstallationId: payload.installation.id,
          })
        );
      }
    }

    console.log(
      JSON.stringify({
        event: "github.installation.created",
        installationId: payload.installation.id,
        repoCount: allRepos.length,
      })
    );
  }

  if (payload.action === "deleted") {
    const repos = await getGithubReposByInstallationId(payload.installation.id);
    for (const repo of repos) {
      await updateRepoSyncStatus(repo.id, "error", "GitHub App uninstalled");
    }
    console.log(
      JSON.stringify({
        event: "github.installation.deleted",
        installationId: payload.installation.id,
        affectedRepos: repos.length,
      })
    );
  }
}

export async function handleInstallationReposEvent(
  payload: InstallationRepositoriesEventPayload
): Promise<void> {
  for (const removed of payload.repositories_removed ?? []) {
    const repo = await getGithubRepoByOwnerAndName(removed.full_name);
    if (repo) {
      await updateRepoSyncStatus(repo.id, "error", "Repository removed from GitHub App");
    }
  }

  if (payload.repositories_added && payload.repositories_added.length > 0) {
    console.log(
      JSON.stringify({
        event: "github.installation_repos.added",
        installationId: payload.installation?.id,
        count: payload.repositories_added.length,
      })
    );
  }
}

async function fetchInstallationRepositories(
  installationId: number
): Promise<Array<{ full_name: string }>> {
  try {
    const settings = await getResolvedGithubSettings();
    if (!settings.enabled || !settings.appId || !settings.appPrivateKey) return [];

    const token = await getInstallationToken({
      appId: settings.appId,
      privateKey: settings.appPrivateKey,
      installationId,
    });

    const resp = await fetchGitHub(
      "/installation/repositories?per_page=100",
      token,
      installationId
    );
    const data = await resp.json();

    if (!data.repositories) return [];
    return data.repositories.map((r: { full_name: string }) => ({
      full_name: r.full_name,
    }));
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "github.installation.fetch_repos_error",
        installationId,
        error: String(err),
      })
    );
    return [];
  }
}

export async function listInstallationRepositoriesFromApi(
  installationId: number
): Promise<Array<{ full_name: string; default_branch: string }>> {
  const settings = await getResolvedGithubSettings();
  if (!settings.enabled || !settings.appId || !settings.appPrivateKey) return [];

  const token = await getInstallationToken({
    appId: settings.appId,
    privateKey: settings.appPrivateKey,
    installationId,
  });

  const resp = await fetchGitHub("/installation/repositories?per_page=100", token, installationId);
  const data = await resp.json();

  if (!data.repositories) return [];
  return data.repositories.map((r: { full_name: string; default_branch: string }) => ({
    full_name: r.full_name,
    default_branch: r.default_branch,
  }));
}
