"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import { SettingsCheckbox, SettingsSaveButton, SettingsSectionShell } from "./SettingsSectionShell";

interface MeetingVideoSectionProps {
  refetchSiteSettings: () => void;
  initialSimulcast: boolean;
  initialDynacast: boolean;
  initialAdaptiveStream: boolean;
}

export function MeetingVideoSection({
  refetchSiteSettings,
  initialSimulcast,
  initialDynacast,
  initialAdaptiveStream,
}: MeetingVideoSectionProps) {
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
    <SettingsSectionShell
      title={t("admin.settings.meetingVideoTitle")}
      description={t("admin.settings.meetingVideoDescription")}
      error={mtgVideoError}
      notice={mtgVideoNotice}
    >
      <div className="space-y-3">
        <SettingsCheckbox
          checked={mtgSimulcast}
          onChange={setMtgSimulcast}
          label={t("admin.settings.simulcast")}
          hint={t("admin.settings.simulcastHint")}
        />
        <SettingsCheckbox
          checked={mtgDynacast}
          onChange={setMtgDynacast}
          label={t("admin.settings.dynacast")}
          hint={t("admin.settings.dynacastHint")}
        />
        <SettingsCheckbox
          checked={mtgAdaptiveStream}
          onChange={setMtgAdaptiveStream}
          label={t("admin.settings.adaptiveStream")}
          hint={t("admin.settings.adaptiveStreamHint")}
        />
        <SettingsSaveButton saving={mtgVideoSaving} onClick={() => void handleMtgVideoSave()} />
      </div>
    </SettingsSectionShell>
  );
}
