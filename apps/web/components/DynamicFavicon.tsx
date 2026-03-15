"use client";

import { getSiteIconUrl, siteSettingsApi } from "@/lib/api";
import { useEffect } from "react";

export function DynamicFavicon() {
  useEffect(() => {
    let cancelled = false;

    void siteSettingsApi
      .get()
      .then((settings) => {
        if (cancelled || !settings.hasSiteIcon) return;

        const url = `${getSiteIconUrl()}?v=${Date.now()}`;

        let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }
        link.href = url;
      })
      .catch(() => {
        // ignore — no favicon is fine
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
