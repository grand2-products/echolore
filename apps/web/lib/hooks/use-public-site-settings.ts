"use client";

import { useQuery } from "@tanstack/react-query";
import { siteSettingsApi } from "../api";

/**
 * Fetches site settings without requiring SiteSettingsProvider.
 * Use this on pages outside the (main) layout (e.g. login).
 */
export function usePublicSiteSettings() {
  return useQuery({
    queryKey: ["site-settings"],
    queryFn: () => siteSettingsApi.get(),
    retry: false,
  });
}
