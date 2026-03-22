"use client";

import { useT } from "@/lib/i18n";
import { INPUT_CLASS, SettingsCheckbox } from "./SettingsSectionShell";

interface GcsFieldGroupProps {
  bucket: string;
  onBucketChange: (v: string) => void;
  useGcpDefaults: boolean;
  onUseGcpDefaultsChange: (v: boolean) => void;
  projectId: string;
  onProjectIdChange: (v: string) => void;
  keyJson: string;
  onKeyJsonChange: (v: string) => void;
  bucketPlaceholder?: string;
}

export function GcsFieldGroup({
  bucket,
  onBucketChange,
  useGcpDefaults,
  onUseGcpDefaultsChange,
  projectId,
  onProjectIdChange,
  keyJson,
  onKeyJsonChange,
  bucketPlaceholder = "my-bucket",
}: GcsFieldGroupProps) {
  const t = useT();

  return (
    <>
      <label className="block text-sm text-gray-700">
        {t("admin.settings.storageGcsBucket")}
        <input
          value={bucket}
          onChange={(e) => onBucketChange(e.target.value)}
          placeholder={bucketPlaceholder}
          className={INPUT_CLASS}
        />
      </label>
      <SettingsCheckbox
        checked={useGcpDefaults}
        onChange={onUseGcpDefaultsChange}
        label={t("admin.settings.storageGcsUseDefaults")}
        hint={t("admin.settings.storageGcsUseDefaultsHint")}
      />
      {!useGcpDefaults && (
        <>
          <label className="block text-sm text-gray-700">
            {t("admin.settings.storageGcsProjectId")}
            <input
              value={projectId}
              onChange={(e) => onProjectIdChange(e.target.value)}
              placeholder="my-gcp-project"
              className={INPUT_CLASS}
            />
          </label>
          <label className="block text-sm text-gray-700">
            {t("admin.settings.storageGcsKeyJson")}
            <textarea
              value={keyJson}
              onChange={(e) => onKeyJsonChange(e.target.value)}
              rows={4}
              placeholder='{"type":"service_account",...}'
              className={INPUT_CLASS}
            />
          </label>
        </>
      )}
    </>
  );
}
