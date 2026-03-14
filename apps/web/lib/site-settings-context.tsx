"use client";

import { type SiteSettings, siteSettingsApi } from "@/lib/api";
import { appTagline, appTitle } from "@/lib/app-config";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const defaultSettings: SiteSettings = {
  siteTitle: appTitle,
  siteTagline: appTagline,
  livekitMeetingSimulcast: true,
  livekitMeetingDynacast: true,
  livekitMeetingAdaptiveStream: true,
  livekitCoworkingSimulcast: true,
  livekitCoworkingDynacast: true,
  livekitCoworkingAdaptiveStream: true,
  livekitCoworkingMode: "sfu",
  livekitCoworkingMcuWidth: 1280,
  livekitCoworkingMcuHeight: 720,
  livekitCoworkingMcuFps: 15,
  livekitCoworkingFocusIdentity: null,
  hasSiteIcon: false,
};

interface SiteSettingsContextValue {
  settings: SiteSettings;
  refetch: () => void;
}

const SiteSettingsContext = createContext<SiteSettingsContextValue>({
  settings: defaultSettings,
  refetch: () => {},
});

function applyDefaults(data: SiteSettings): SiteSettings {
  return {
    siteTitle: data.siteTitle || appTitle,
    siteTagline: data.siteTagline || appTagline,
    livekitMeetingSimulcast: data.livekitMeetingSimulcast ?? true,
    livekitMeetingDynacast: data.livekitMeetingDynacast ?? true,
    livekitMeetingAdaptiveStream: data.livekitMeetingAdaptiveStream ?? true,
    livekitCoworkingSimulcast: data.livekitCoworkingSimulcast ?? true,
    livekitCoworkingDynacast: data.livekitCoworkingDynacast ?? true,
    livekitCoworkingAdaptiveStream: data.livekitCoworkingAdaptiveStream ?? true,
    livekitCoworkingMode: data.livekitCoworkingMode ?? "sfu",
    livekitCoworkingMcuWidth: data.livekitCoworkingMcuWidth ?? 1280,
    livekitCoworkingMcuHeight: data.livekitCoworkingMcuHeight ?? 720,
    livekitCoworkingMcuFps: data.livekitCoworkingMcuFps ?? 15,
    livekitCoworkingFocusIdentity: data.livekitCoworkingFocusIdentity ?? null,
    hasSiteIcon: data.hasSiteIcon ?? false,
  };
}

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [fetchNonce, setFetchNonce] = useState(0);

  const refetch = useCallback(() => {
    setFetchNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    void siteSettingsApi
      .get()
      .then((data) => setSettings(applyDefaults(data)))
      .catch(() => {
        // keep defaults
      });
  }, [fetchNonce]);

  const value = useMemo(() => ({ settings, refetch }), [settings, refetch]);

  return (
    <SiteSettingsContext.Provider value={value}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings() {
  return useContext(SiteSettingsContext);
}

export function useSiteTitle() {
  return useContext(SiteSettingsContext).settings.siteTitle;
}

export function useSiteTagline() {
  return useContext(SiteSettingsContext).settings.siteTagline;
}

export function useMeetingLivekitSettings() {
  const { settings: ctx } = useContext(SiteSettingsContext);
  return {
    simulcast: ctx.livekitMeetingSimulcast,
    dynacast: ctx.livekitMeetingDynacast,
    adaptiveStream: ctx.livekitMeetingAdaptiveStream,
  };
}

export function useCoworkingLivekitSettings() {
  const { settings: ctx } = useContext(SiteSettingsContext);
  return {
    simulcast: ctx.livekitCoworkingSimulcast,
    dynacast: ctx.livekitCoworkingDynacast,
    adaptiveStream: ctx.livekitCoworkingAdaptiveStream,
    mode: ctx.livekitCoworkingMode,
    mcuWidth: ctx.livekitCoworkingMcuWidth,
    mcuHeight: ctx.livekitCoworkingMcuHeight,
    mcuFps: ctx.livekitCoworkingMcuFps,
  };
}
