import { ApiError, buildApiUrl } from "./fetch";
import type { SiteSettings } from "./types";

export const siteSettingsApi = {
  get: async (): Promise<SiteSettings> => {
    const response = await fetch(buildApiUrl("/site-settings"), { credentials: "include" });
    if (!response.ok) {
      throw new ApiError("Failed to fetch site settings", { status: response.status });
    }
    return response.json();
  },
};

export function getSiteIconUrl() {
  return buildApiUrl("/site-icon");
}

export function getWikiFileDownloadUrl(pageId: string, fileId: string) {
  return buildApiUrl(`/wiki/${encodeURIComponent(pageId)}/files/${encodeURIComponent(fileId)}/download`);
}
