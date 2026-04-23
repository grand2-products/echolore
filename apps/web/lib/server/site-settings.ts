import "server-only";
import { unstable_cache } from "next/cache";
import type { SiteSettings } from "@/lib/api/types";

export const SITE_SETTINGS_CACHE_TAG = "site-settings";

const FETCH_TIMEOUT_MS = 2000;

function resolveServerApiUrl(): string {
  const internal = process.env.ECHOLORE_API_INTERNAL_URL;
  if (internal) return internal.replace(/\/+$/, "");
  const publicUrl = process.env.ECHOLORE_PUBLIC_API_URL;
  if (publicUrl) return publicUrl.replace(/\/+$/, "");
  return "http://localhost:3001";
}

async function fetchSiteSettingsUncached(): Promise<SiteSettings | null> {
  try {
    const response = await fetch(`${resolveServerApiUrl()}/api/site-settings`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as SiteSettings;
  } catch {
    return null;
  }
}

export const fetchSiteSettingsFromServer = unstable_cache(
  fetchSiteSettingsUncached,
  ["site-settings"],
  { tags: [SITE_SETTINGS_CACHE_TAG] }
);
