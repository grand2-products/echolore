"use client";

import { adminApi } from "@/lib/api";
import { useSettingsForm } from "@/lib/hooks/use-settings-form";
import { useT } from "@/lib/i18n";
import { useState } from "react";
import { INPUT_CLASS, SettingsSectionShell } from "./SettingsSectionShell";

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
            <span
              title={t("admin.settings.siteTitleTooltip")}
              className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-gray-300 text-[10px] text-gray-400"
            >
              ?
            </span>
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
            <span
              title={t("admin.settings.siteTaglineTooltip")}
              className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-gray-300 text-[10px] text-gray-400"
            >
              ?
            </span>
          </span>
          <input
            value={siteTagline}
            onChange={(e) => setSiteTagline(e.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
        >
          {saving ? t("admin.settings.saving") : t("admin.settings.save")}
        </button>
      </div>
    </SettingsSectionShell>
  );
}
