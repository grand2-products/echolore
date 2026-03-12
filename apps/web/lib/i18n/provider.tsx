"use client";

import { useEffect } from "react";
import { defaultLocale, supportedLocales } from "./messages";
import { normalizeLocale, useI18nStore } from "./store";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useI18nStore((state) => state.locale);
  const hydrateLocale = useI18nStore((state) => state.hydrateLocale);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const persisted = window.localStorage.getItem("corp-internal-locale");
    if (persisted) return;

    const browserLocale =
      typeof navigator !== "undefined" ? navigator.language : defaultLocale;
    hydrateLocale(browserLocale);
  }, [hydrateLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    document.cookie = `locale=${locale}; path=/; max-age=31536000; samesite=lax`;
  }, [locale]);

  return children;
}

export { defaultLocale, supportedLocales, normalizeLocale };
