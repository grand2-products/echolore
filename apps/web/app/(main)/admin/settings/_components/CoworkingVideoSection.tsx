"use client";

import { useCallback, useState } from "react";
import { adminApi, type LivekitParticipantInfo, livekitApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import { COWORKING_ROOM_NAME } from "@/lib/livekit";
import {
  INPUT_CLASS,
  SettingsCheckbox,
  SettingsSaveButton,
  SettingsSectionShell,
} from "./SettingsSectionShell";

interface CoworkingVideoSectionProps {
  refetchSiteSettings: () => void;
  initialSimulcast: boolean;
  initialDynacast: boolean;
  initialAdaptiveStream: boolean;
  initialMode: "sfu" | "mcu";
  initialMcuWidth: number;
  initialMcuHeight: number;
  initialMcuFps: number;
  initialFocusIdentity: string;
}

export function CoworkingVideoSection({
  refetchSiteSettings,
  initialSimulcast,
  initialDynacast,
  initialAdaptiveStream,
  initialMode,
  initialMcuWidth,
  initialMcuHeight,
  initialMcuFps,
  initialFocusIdentity,
}: CoworkingVideoSectionProps) {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();

  const [cwSimulcast, setCwSimulcast] = useState(initialSimulcast);
  const [cwDynacast, setCwDynacast] = useState(initialDynacast);
  const [cwAdaptiveStream, setCwAdaptiveStream] = useState(initialAdaptiveStream);
  const [cwMode, setCwMode] = useState<"sfu" | "mcu">(initialMode);
  const [cwMcuWidth, setCwMcuWidth] = useState(initialMcuWidth);
  const [cwMcuHeight, setCwMcuHeight] = useState(initialMcuHeight);
  const [cwMcuFps, setCwMcuFps] = useState(initialMcuFps);
  const [cwFocusIdentity, setCwFocusIdentity] = useState(initialFocusIdentity);
  const [cwParticipants, setCwParticipants] = useState<LivekitParticipantInfo[]>([]);
  const [cwParticipantsLoading, setCwParticipantsLoading] = useState(false);
  const [cwParticipantsError, setCwParticipantsError] = useState<string | null>(null);
  const [cwVideoSaving, setCwVideoSaving] = useState(false);
  const [cwVideoError, setCwVideoError] = useState<string | null>(null);
  const [cwVideoNotice, setCwVideoNotice] = useState<string | null>(null);

  const fetchCoworkingParticipants = useCallback(async () => {
    setCwParticipantsLoading(true);
    setCwParticipantsError(null);
    try {
      const data = await livekitApi.listParticipants(COWORKING_ROOM_NAME);
      setCwParticipants(data.participants);
      if (data.participants.length === 0) {
        setCwParticipantsError(t("admin.settings.cwFocusNoParticipants"));
      }
    } catch {
      setCwParticipants([]);
      setCwParticipantsError(t("admin.settings.cwFocusFetchError"));
    } finally {
      setCwParticipantsLoading(false);
    }
  }, [t]);

  const handleCwVideoSave = async () => {
    setCwVideoSaving(true);
    setCwVideoError(null);
    setCwVideoNotice(null);
    try {
      await adminApi.updateSiteSettings({
        livekitCoworkingSimulcast: cwSimulcast,
        livekitCoworkingDynacast: cwDynacast,
        livekitCoworkingAdaptiveStream: cwAdaptiveStream,
        livekitCoworkingMode: cwMode,
        livekitCoworkingMcuWidth: cwMcuWidth,
        livekitCoworkingMcuHeight: cwMcuHeight,
        livekitCoworkingMcuFps: cwMcuFps,
        livekitCoworkingFocusIdentity: cwFocusIdentity || null,
      });
      refetchSiteSettings();
      setCwVideoNotice(t("admin.settings.updated"));
    } catch (saveError) {
      setCwVideoError(getApiErrorMessage(saveError, t("admin.settings.saveError")));
    } finally {
      setCwVideoSaving(false);
    }
  };

  return (
    <SettingsSectionShell
      title={t("admin.settings.coworkingVideoTitle")}
      description={t("admin.settings.coworkingVideoDescription")}
      error={cwVideoError}
      notice={cwVideoNotice}
    >
      <div className="space-y-3">
        {/* Mode selector */}
        <label className="block text-sm text-gray-700">
          {t("admin.settings.cwMode")}
          <select
            value={cwMode}
            onChange={(e) => setCwMode(e.target.value as "sfu" | "mcu")}
            className={`${INPUT_CLASS} cursor-pointer`}
          >
            <option value="sfu">{t("admin.settings.cwModeSfu")}</option>
            <option value="mcu">{t("admin.settings.cwModeMcu")}</option>
          </select>
        </label>

        {cwMode === "sfu" && (
          <>
            <SettingsCheckbox
              checked={cwSimulcast}
              onChange={setCwSimulcast}
              label={t("admin.settings.simulcast")}
              hint={t("admin.settings.simulcastHint")}
            />
            <SettingsCheckbox
              checked={cwDynacast}
              onChange={setCwDynacast}
              label={t("admin.settings.dynacast")}
              hint={t("admin.settings.dynacastHint")}
            />
            <SettingsCheckbox
              checked={cwAdaptiveStream}
              onChange={setCwAdaptiveStream}
              label={t("admin.settings.adaptiveStream")}
              hint={t("admin.settings.adaptiveStreamHint")}
            />
          </>
        )}

        {cwMode === "mcu" && (
          <div className="space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
            <p className="text-xs text-indigo-700">{t("admin.settings.cwMcuHint")}</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm text-gray-700">
                {t("admin.settings.cwMcuWidth")}
                <input
                  type="number"
                  value={cwMcuWidth}
                  onChange={(e) => setCwMcuWidth(Number(e.target.value))}
                  min={320}
                  max={1920}
                  className={INPUT_CLASS}
                />
              </label>
              <label className="block text-sm text-gray-700">
                {t("admin.settings.cwMcuHeight")}
                <input
                  type="number"
                  value={cwMcuHeight}
                  onChange={(e) => setCwMcuHeight(Number(e.target.value))}
                  min={240}
                  max={1080}
                  className={INPUT_CLASS}
                />
              </label>
            </div>
            <label className="block text-sm text-gray-700">
              {t("admin.settings.cwMcuFps")}
              <input
                type="number"
                value={cwMcuFps}
                onChange={(e) => setCwMcuFps(Number(e.target.value))}
                min={1}
                max={30}
                className={INPUT_CLASS}
              />
            </label>
            <div className="space-y-1.5">
              <span className="block text-sm font-medium text-gray-700">
                {t("admin.settings.cwFocusIdentity")}
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={cwFocusIdentity}
                  onChange={(e) => setCwFocusIdentity(e.target.value)}
                  placeholder={t("admin.settings.cwFocusIdentityPlaceholder")}
                  className={`${INPUT_CLASS} flex-1`}
                />
                <button
                  type="button"
                  onClick={() => void fetchCoworkingParticipants()}
                  disabled={cwParticipantsLoading}
                  className="flex-shrink-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  title={t("admin.settings.cwFocusRefresh")}
                >
                  {cwParticipantsLoading ? "..." : t("admin.settings.cwFocusRefresh")}
                </button>
              </div>
              {cwParticipantsError && cwParticipants.length === 0 && (
                <p className="text-xs text-gray-500">{cwParticipantsError}</p>
              )}
              {cwParticipants.length > 0 && (
                <div className="flex flex-wrap gap-1.5 rounded-md border border-gray-200 bg-white p-2">
                  <button
                    type="button"
                    onClick={() => setCwFocusIdentity("")}
                    className={`rounded-full border px-2.5 py-1 text-xs transition ${
                      !cwFocusIdentity
                        ? "border-indigo-300 bg-indigo-100 text-indigo-800"
                        : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {t("admin.settings.cwFocusNone")}
                  </button>
                  {cwParticipants.map((p) => (
                    <button
                      key={p.identity}
                      type="button"
                      onClick={() => setCwFocusIdentity(p.identity)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        cwFocusIdentity === p.identity
                          ? "border-indigo-300 bg-indigo-100 text-indigo-800"
                          : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {p.name || p.identity}
                      {p.name && p.name !== p.identity && (
                        <span className="ml-1 text-[10px] text-gray-400">{p.identity}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <span className="block text-xs text-gray-500">
                {t("admin.settings.cwFocusIdentityHint")}
              </span>
              <span className="block text-xs text-amber-600">
                {t("admin.settings.cwFocusIdentityRestartNote")}
              </span>
            </div>
          </div>
        )}

        <SettingsSaveButton saving={cwVideoSaving} onClick={() => void handleCwVideoSave()} />
      </div>
    </SettingsSectionShell>
  );
}
