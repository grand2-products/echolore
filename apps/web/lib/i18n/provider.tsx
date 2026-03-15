"use client";

import { useEffect } from "react";
import { STORAGE_KEYS } from "../constants/storage-keys";
import { defaultLocale, supportedLocales } from "./messages";
import { normalizeLocale, useI18nStore } from "./store";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useI18nStore((state) => state.locale);
  const hydrateLocale = useI18nStore((state) => state.hydrateLocale);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const persisted = window.localStorage.getItem(STORAGE_KEYS.locale);
    if (persisted) return;

    const browserLocale = typeof navigator !== "undefined" ? navigator.language : defaultLocale;
    hydrateLocale(browserLocale);
  }, [hydrateLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const ONE_YEAR = 60 * 60 * 24 * 365;
    document.cookie = `locale=${locale}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
  }, [locale]);

  return children;
}

export { defaultLocale, supportedLocales, normalizeLocale };
