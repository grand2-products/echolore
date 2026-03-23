const GITHUB_REPO = Deno.env.get("GITHUB_REPO") ?? "grand2-products/echolore";

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  body: string | null;
  published_at: string | null;
}

export interface ReleaseInfo {
  version: string;
  releaseUrl: string;
  releaseNotes: string | null;
  publishedAt: string | null;
}

export async function fetchLatestRelease(): Promise<ReleaseInfo> {
  const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "echolore-updater",
    },
  });

  if (!resp.ok) {
    throw new Error(`GitHub API error: ${resp.status} ${resp.statusText}`);
  }

  const data: GitHubRelease = await resp.json();

  return {
    version: data.tag_name,
    releaseUrl: data.html_url,
    releaseNotes: data.body,
    publishedAt: data.published_at,
  };
}

export function composeDownloadUrl(version: string): string {
  return `https://github.com/${GITHUB_REPO}/releases/download/${version}/docker-compose.production.yml`;
}
