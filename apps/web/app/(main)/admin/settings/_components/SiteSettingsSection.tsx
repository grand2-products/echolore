"use client";

import { useState } from "react";
import { Tooltip } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { useSettingsForm } from "@/lib/hooks/use-settings-form";
import { useT } from "@/lib/i18n";
import { INPUT_CLASS, SettingsSaveButton, SettingsSectionShell } from "./SettingsSectionShell";

interface SiteSettingsSectionProps {
  refetchSiteSettings: () => void;
  onLoadedSiteSettings?: (data: {
    hasSiteIcon: boolean;
    mtgSimulcast: boolean;
    mtgDynacast: boolean;
    mtgAdaptiveStream: boolean;
    cwSimulcast: boolean;
    cwDynacast: boolean;
    cwAdaptiveStream: boolean;
    cwMode: "sfu" | "mcu";
    cwMcuWidth: number;
    cwMcuHeight: number;
    cwMcuFps: number;
    cwFocusIdentity: string;
  }) => void;
}

export function SiteSettingsSection({
  refetchSiteSettings,
  onLoadedSiteSettings,
}: SiteSettingsSectionProps) {
  const t = useT();

  const [siteTitle, setSiteTitle] = useState("");
  const [siteTagline, setSiteTagline] = useState("");

  const { loading, saving, error, notice, loadSettings, handleSave } = useSettingsForm({
    load: () => adminApi.getSiteSettings(),
    onLoaded: (data) => {
      setSiteTitle(data.siteTitle ?? "");
      setSiteTagline(data.siteTagline ?? "");
      onLoadedSiteSettings?.({
        hasSiteIcon: data.hasSiteIcon ?? false,
        mtgSimulcast: data.livekitMeetingSimulcast ?? true,
        mtgDynacast: data.livekitMeetingDynacast ?? true,
        mtgAdaptiveStream: data.livekitMeetingAdaptiveStream ?? true,
        cwSimulcast: data.livekitCoworkingSimulcast ?? true,
        cwDynacast: data.livekitCoworkingDynacast ?? true,
        cwAdaptiveStream: data.livekitCoworkingAdaptiveStream ?? true,
        cwMode: data.livekitCoworkingMode ?? "sfu",
        cwMcuWidth: data.livekitCoworkingMcuWidth ?? 1280,
        cwMcuHeight: data.livekitCoworkingMcuHeight ?? 720,
        cwMcuFps: data.livekitCoworkingMcuFps ?? 15,
        cwFocusIdentity: data.livekitCoworkingFocusIdentity ?? "",
      });
    },
    save: async () => {
      await adminApi.updateSiteSettings({ siteTitle, siteTagline });
      refetchSiteSettings();
    },
  });

  return (
    <SettingsSectionShell
      title={t("admin.settings.siteTitle")}
      error={error}
      notice={notice}
      loading={loading}
      onRetry={() => void loadSettings()}
    >
      <div className="space-y-4">
        <label className="block text-sm text-gray-700">
          <span className="inline-flex items-center gap-1">
            {t("admin.settings.siteTitle")}
            <Tooltip text={t("admin.settings.siteTitleTooltip")} />
          </span>
          <input
            value={siteTitle}
            onChange={(e) => setSiteTitle(e.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        <label className="block text-sm text-gray-700">
          <span className="inline-flex items-center gap-1">
            {t("admin.settings.siteTagline")}
            <Tooltip text={t("admin.settings.siteTaglineTooltip")} />
          </span>
          <input
            value={siteTagline}
            onChange={(e) => setSiteTagline(e.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        <SettingsSaveButton saving={saving} onClick={() => void handleSave()} />
      </div>
    </SettingsSectionShell>
  );
}
