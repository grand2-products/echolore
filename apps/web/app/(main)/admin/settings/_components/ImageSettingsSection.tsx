"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import {
  INPUT_CLASS,
  SettingsCheckbox,
  SettingsSaveButton,
  SettingsSectionShell,
} from "./SettingsSectionShell";

interface ImageSettingsSectionProps {
  initialPngAutoCompress: boolean;
  initialThresholdKb: number;
}

const MIN_THRESHOLD_KB = 0;
const MAX_THRESHOLD_KB = 51200; // 50 MB — matches the API upload size cap.

export function ImageSettingsSection({
  initialPngAutoCompress,
  initialThresholdKb,
}: ImageSettingsSectionProps) {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();

  const [pngAutoCompress, setPngAutoCompress] = useState(initialPngAutoCompress);
  const [thresholdKb, setThresholdKb] = useState(String(initialThresholdKb));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSave = async () => {
    const parsed = Number(thresholdKb);
    if (!Number.isInteger(parsed) || parsed < MIN_THRESHOLD_KB || parsed > MAX_THRESHOLD_KB) {
      setError(t("admin.settings.pngCompressThresholdError"));
      setNotice(null);
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await adminApi.updateSiteSettings({
        pngAutoCompress,
        pngCompressThresholdKb: parsed,
      });
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
        <label className="block text-sm text-gray-700">
          <span className="font-medium">{t("admin.settings.pngCompressThreshold")}</span>
          <input
            type="number"
            min={MIN_THRESHOLD_KB}
            max={MAX_THRESHOLD_KB}
            step={1}
            value={thresholdKb}
            onChange={(e) => setThresholdKb(e.target.value)}
            disabled={!pngAutoCompress}
            className={`${INPUT_CLASS} disabled:bg-gray-100 disabled:text-gray-400`}
          />
          <span className="mt-1 block text-xs text-gray-500">
            {t("admin.settings.pngCompressThresholdHint")}
          </span>
        </label>
        <SettingsSaveButton saving={saving} onClick={() => void handleSave()} />
      </div>
    </SettingsSectionShell>
  );
}
