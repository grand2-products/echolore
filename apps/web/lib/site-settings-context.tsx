"use client";

import { type SiteSettings, siteSettingsApi } from "@/lib/api";
import { appTagline, appTitle } from "@/lib/app-config";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const defaultSettings: SiteSettings = {
  siteTitle: appTitle,
  siteTagline: appTagline,
  livekitMeetingSimulcast: true,
  livekitMeetingDynacast: true,
  livekitMeetingAdaptiveStream: true,
  livekitCoworkingSimulcast: true,
  livekitCoworkingDynacast: true,
  livekitCoworkingAdaptiveStream: true,
  hasSiteIcon: false,
};

const SiteSettingsContext = createContext<SiteSettings>(defaultSettings);

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);

  useEffect(() => {
    void siteSettingsApi
      .get()
      .then((data) => {
        setSettings({
          siteTitle: data.siteTitle || appTitle,
          siteTagline: data.siteTagline || appTagline,
          livekitMeetingSimulcast: data.livekitMeetingSimulcast ?? true,
          livekitMeetingDynacast: data.livekitMeetingDynacast ?? true,
          livekitMeetingAdaptiveStream: data.livekitMeetingAdaptiveStream ?? true,
          livekitCoworkingSimulcast: data.livekitCoworkingSimulcast ?? true,
          livekitCoworkingDynacast: data.livekitCoworkingDynacast ?? true,
          livekitCoworkingAdaptiveStream: data.livekitCoworkingAdaptiveStream ?? true,
          hasSiteIcon: data.hasSiteIcon ?? false,
        });
      })
      .catch(() => {
        // keep defaults
      });
  }, []);

  return (
    <SiteSettingsContext.Provider value={settings}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteTitle() {
  return useContext(SiteSettingsContext).siteTitle;
}

export function useSiteTagline() {
  return useContext(SiteSettingsContext).siteTagline;
}

export function useMeetingLivekitSettings() {
  const ctx = useContext(SiteSettingsContext);
  return {
    simulcast: ctx.livekitMeetingSimulcast,
    dynacast: ctx.livekitMeetingDynacast,
    adaptiveStream: ctx.livekitMeetingAdaptiveStream,
  };
}

export function useCoworkingLivekitSettings() {
  const ctx = useContext(SiteSettingsContext);
  return {
    simulcast: ctx.livekitCoworkingSimulcast,
    dynacast: ctx.livekitCoworkingDynacast,
    adaptiveStream: ctx.livekitCoworkingAdaptiveStream,
  };
}
