"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { STORAGE_KEYS } from "../constants/storage-keys";
import { type SupportedLocale, defaultLocale, supportedLocales } from "./messages";

type I18nState = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  hydrateLocale: (locale: string | null | undefined) => void;
};

function normalizeLocale(locale: string | null | undefined): SupportedLocale {
  if (!locale) return defaultLocale;

  if (supportedLocales.includes(locale as SupportedLocale)) {
    return locale as SupportedLocale;
  }

  const lower = locale.toLowerCase();
  if (lower.startsWith("ja")) return "ja";
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("zh")) return "zh-CN";
  if (lower.startsWith("ko")) return "ko";

  return defaultLocale;
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      locale: defaultLocale,
      setLocale: (locale) => set({ locale }),
      hydrateLocale: (locale) => set({ locale: normalizeLocale(locale) }),
    }),
    {
      name: STORAGE_KEYS.locale,
      partialize: (state) => ({ locale: state.locale }),
    }
  )
);

export { normalizeLocale };
