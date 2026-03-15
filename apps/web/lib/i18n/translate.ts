"use client";

import { useCallback } from "react";
import {
  type SupportedLocale,
  type TranslationDictionary,
  defaultLocale,
  messagesByLocale,
} from "./messages";
import { useI18nStore } from "./store";

export type TranslationValues = Record<string, string | number>;

function readPath(dictionary: TranslationDictionary, key: string): string | null {
  const parts = key.split(".");
  let current: string | TranslationDictionary | undefined = dictionary;

  for (const part of parts) {
    if (!current || typeof current === "string") {
      return null;
    }
    current = current[part];
  }

  return typeof current === "string" ? current : null;
}

function interpolate(template: string, values?: TranslationValues) {
  if (!values) return template;

  return template.replace(/\{(\w+)\}/g, (_, token) =>
    values[token] !== undefined ? String(values[token]) : `{${token}}`
  );
}

export function translate(locale: SupportedLocale, key: string, values?: TranslationValues) {
  const dictionary = messagesByLocale[locale] ?? messagesByLocale[defaultLocale];
  const message =
    readPath(dictionary, key) ?? readPath(messagesByLocale[defaultLocale], key) ?? key;

  return interpolate(message, values);
}

export function useLocale() {
  return useI18nStore((state) => state.locale);
}

export function useSetLocale() {
  return useI18nStore((state) => state.setLocale);
}

export function useT() {
  const locale = useLocale();
  return useCallback(
    (key: string, values?: TranslationValues) => translate(locale, key, values),
    [locale]
  );
}
