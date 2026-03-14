"use client";

import { adminApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import { useState } from "react";

interface MeetingVideoSectionProps {
  refetchSiteSettings: () => void;
  initialSimulcast: boolean;
  initialDynacast: boolean;
  initialAdaptiveStream: boolean;
}

export function MeetingVideoSection({ refetchSiteSettings, initialSimulcast, initialDynacast, initialAdaptiveStream }: MeetingVideoSectionProps) {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();

  const [mtgSimulcast, setMtgSimulcast] = useState(initialSimulcast);
  const [mtgDynacast, setMtgDynacast] = useState(initialDynacast);
  const [mtgAdaptiveStream, setMtgAdaptiveStream] = useState(initialAdaptiveStream);
  const [mtgVideoSaving, setMtgVideoSaving] = useState(false);
  const [mtgVideoError, setMtgVideoError] = useState<string | null>(null);
  const [mtgVideoNotice, setMtgVideoNotice] = useState<string | null>(null);

  const handleMtgVideoSave = async () => {
    setMtgVideoSaving(true);
    setMtgVideoError(null);
    setMtgVideoNotice(null);
    try {
      await adminApi.updateSiteSettings({
        livekitMeetingSimulcast: mtgSimulcast,
        livekitMeetingDynacast: mtgDynacast,
        livekitMeetingAdaptiveStream: mtgAdaptiveStream,
      });
      refetchSiteSettings();
      setMtgVideoNotice(t("admin.settings.updated"));
    } catch (saveError) {
      setMtgVideoError(getApiErrorMessage(saveError, t("admin.settings.saveError")));
    } finally {
      setMtgVideoSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">{t("admin.settings.meetingVideoTitle")}</h2>
      <p className="mb-4 text-sm text-gray-500">{t("admin.settings.meetingVideoDescription")}</p>
      {mtgVideoError ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{mtgVideoError}</div> : null}
      {mtgVideoNotice ? <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{mtgVideoNotice}</div> : null}
      <div className="space-y-3">
        <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
          <input type="checkbox" checked={mtgSimulcast} onChange={(e) => setMtgSimulcast(e.target.checked)} className="mt-0.5 rounded border-gray-300" />
          <div><div className="font-medium">{t("admin.settings.simulcast")}</div><div className="mt-0.5 text-xs text-gray-500">{t("admin.settings.simulcastHint")}</div></div>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
          <input type="checkbox" checked={mtgDynacast} onChange={(e) => setMtgDynacast(e.target.checked)} className="mt-0.5 rounded border-gray-300" />
          <div><div className="font-medium">{t("admin.settings.dynacast")}</div><div className="mt-0.5 text-xs text-gray-500">{t("admin.settings.dynacastHint")}</div></div>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
          <input type="checkbox" checked={mtgAdaptiveStream} onChange={(e) => setMtgAdaptiveStream(e.target.checked)} className="mt-0.5 rounded border-gray-300" />
          <div><div className="font-medium">{t("admin.settings.adaptiveStream")}</div><div className="mt-0.5 text-xs text-gray-500">{t("admin.settings.adaptiveStreamHint")}</div></div>
        </label>
        <button type="button" onClick={() => void handleMtgVideoSave()} disabled={mtgVideoSaving} className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60">
          {mtgVideoSaving ? t("admin.settings.saving") : t("admin.settings.save")}
        </button>
      </div>
    </section>
  );
}
