"use client";

import { useMemo } from "react";
import type { SupportedLocale } from "./messages";
import { type TranslationValues, translate, useLocale } from "./translate";

export function formatDate(value: string | number | Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function formatDateTime(value: string | number | Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatTime(value: string | number | Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

function translateEnum(
  locale: SupportedLocale,
  key: string,
  fallback: string,
  values?: TranslationValues
) {
  try {
    return translate(locale, key, values);
  } catch {
    return fallback;
  }
}

export function formatUserRole(value: string, locale: SupportedLocale) {
  if (value === "admin") {
    return translateEnum(locale, "settings.roleAdmin", value);
  }
  if (value === "member") {
    return translateEnum(locale, "settings.roleMember", value);
  }
  return value;
}

export function formatSessionClientType(value: string, locale: SupportedLocale) {
  if (value === "web") {
    return translateEnum(locale, "settings.clientTypeWeb", value);
  }
  if (value === "mobile") {
    return translateEnum(locale, "settings.clientTypeMobile", value);
  }
  return value;
}

export function formatAuthMode(value: string | null, locale: SupportedLocale) {
  if (value === "password") {
    return translateEnum(locale, "settings.authModePassword", value);
  }
  if (value === "sso") {
    return translateEnum(locale, "settings.authModeSso", value);
  }
  return value ?? "";
}

export function formatAgentProvider(value: string, locale: SupportedLocale) {
  if (value === "google") {
    return translateEnum(locale, "common.providerGoogle", value);
  }
  if (value === "vertex") {
    return translateEnum(locale, "common.providerVertex", value);
  }
  if (value === "zhipu") {
    return translateEnum(locale, "common.providerZhipu", value);
  }
  return value;
}

export function formatInterventionStyle(value: string, locale: SupportedLocale) {
  if (value === "facilitator") {
    return translateEnum(locale, "common.interventionStyleFacilitator", value);
  }
  return value;
}

export function formatMeetingAgentEventType(value: string, locale: SupportedLocale) {
  if (value === "invoked") {
    return translateEnum(locale, "common.eventInvoked", value);
  }
  if (value === "left") {
    return translateEnum(locale, "common.eventLeft", value);
  }
  if (value === "response.generated") {
    return translateEnum(locale, "common.eventResponseGenerated", value);
  }
  if (value === "response.autonomous") {
    return translateEnum(locale, "common.eventResponseAutonomous", value);
  }
  return value;
}

export function useFormatters() {
  const locale = useLocale();

  return useMemo(
    () => ({
      locale,
      date: (value: string | number | Date) => formatDate(value, locale),
      dateTime: (value: string | number | Date) => formatDateTime(value, locale),
      time: (value: string | number | Date) => formatTime(value, locale),
      number: (value: number) => formatNumber(value, locale),
      role: (value: string) => formatUserRole(value, locale),
      clientType: (value: string) => formatSessionClientType(value, locale),
      authMode: (value: string | null) => formatAuthMode(value, locale),
      provider: (value: string) => formatAgentProvider(value, locale),
      interventionStyle: (value: string) => formatInterventionStyle(value, locale),
      eventType: (value: string) => formatMeetingAgentEventType(value, locale),
    }),
    [locale]
  );
}
