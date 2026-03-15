"use client";

import { adminApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import { useStableEvent } from "@/lib/hooks/use-stable-event";
import { useEffect, useState } from "react";

const INPUT_CLASS = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2";

interface SiteSettingsSectionProps {
  refetchSiteSettings: () => void;
  onLoadedSiteSettings?: (data: { hasSiteIcon: boolean; mtgSimulcast: boolean; mtgDynacast: boolean; mtgAdaptiveStream: boolean; cwSimulcast: boolean; cwDynacast: boolean; cwAdaptiveStream: boolean; cwMode: "sfu" | "mcu"; cwMcuWidth: number; cwMcuHeight: number; cwMcuFps: number; cwFocusIdentity: string }) => void;
}

export function SiteSettingsSection({ refetchSiteSettings, onLoadedSiteSettings }: SiteSettingsSectionProps) {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();

  const [siteTitle, setSiteTitle] = useState("");
  const [siteTagline, setSiteTagline] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSettings = useStableEvent(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminApi.getSiteSettings();
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
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, t("admin.settings.loadError")));
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await adminApi.updateSiteSettings({ siteTitle, siteTagline });
      refetchSiteSettings();
      setNotice(t("admin.settings.updated"));
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, t("admin.settings.saveError")));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{t("admin.settings.siteTitle")}</h2>

      {error ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => void loadSettings()} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
            {t("common.actions.retry")}
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>
      ) : null}

      {isLoading ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">{t("admin.settings.loading")}</div>
      ) : (
        <div className="space-y-4">
          <label className="block text-sm text-gray-700">
            <span className="inline-flex items-center gap-1">
              {t("admin.settings.siteTitle")}
              <span title={t("admin.settings.siteTitleTooltip")} className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-gray-300 text-[10px] text-gray-400">?</span>
            </span>
            <input value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} className={INPUT_CLASS} />
          </label>
          <label className="block text-sm text-gray-700">
            <span className="inline-flex items-center gap-1">
              {t("admin.settings.siteTagline")}
              <span title={t("admin.settings.siteTaglineTooltip")} className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-gray-300 text-[10px] text-gray-400">?</span>
            </span>
            <input value={siteTagline} onChange={(e) => setSiteTagline(e.target.value)} className={INPUT_CLASS} />
          </label>
          <button type="button" onClick={() => void handleSave()} disabled={isSaving} className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60">
            {isSaving ? t("admin.settings.saving") : t("admin.settings.save")}
          </button>
        </div>
      )}
    </section>
  );
}
