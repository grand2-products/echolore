"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import { SettingsCheckbox, SettingsSaveButton, SettingsSectionShell } from "./SettingsSectionShell";

interface ImageSettingsSectionProps {
  initialPngAutoCompress: boolean;
}

export function ImageSettingsSection({ initialPngAutoCompress }: ImageSettingsSectionProps) {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();

  const [pngAutoCompress, setPngAutoCompress] = useState(initialPngAutoCompress);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await adminApi.updateSiteSettings({ pngAutoCompress });
      setNotice(t("admin.settings.updated"));
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, t("admin.settings.saveError")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSectionShell
      title={t("admin.settings.imageCompressionTitle")}
      description={t("admin.settings.imageCompressionDescription")}
      error={error}
      notice={notice}
    >
      <div className="space-y-3">
        <SettingsCheckbox
          checked={pngAutoCompress}
          onChange={setPngAutoCompress}
          label={t("admin.settings.pngAutoCompress")}
          hint={t("admin.settings.pngAutoCompressHint")}
        />
        <SettingsSaveButton saving={saving} onClick={() => void handleSave()} />
      </div>
    </SettingsSectionShell>
  );
}
