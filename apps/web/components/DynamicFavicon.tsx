"use client";

import { useEffect } from "react";
import { getSiteIconUrl } from "@/lib/api";
import { usePublicSiteSettings } from "@/lib/hooks/use-public-site-settings";

export function DynamicFavicon() {
  const { data: settings } = usePublicSiteSettings();

  useEffect(() => {
    if (!settings?.hasSiteIcon) return;

    const url = `${getSiteIconUrl()}?v=${Date.now()}`;

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = url;
  }, [settings?.hasSiteIcon]);

  return null;
}
