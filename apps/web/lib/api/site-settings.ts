import { buildApiUrl, fetchApi } from "./fetch";
import type { SiteSettings } from "./types";

export const siteSettingsApi = {
  get: async (): Promise<SiteSettings> => fetchApi<SiteSettings>("/site-settings"),
};

export function getSiteIconUrl() {
  return buildApiUrl("/site-icon");
}

export function getWikiFileDownloadUrl(pageId: string, fileId: string) {
  return buildApiUrl(
    `/wiki/${encodeURIComponent(pageId)}/files/${encodeURIComponent(fileId)}/download`
  );
}
