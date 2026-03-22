"use client";

import { useT } from "@/lib/i18n";
import { INPUT_CLASS, SettingsCheckbox } from "./SettingsSectionShell";

interface S3FieldGroupProps {
  endpoint: string;
  onEndpointChange: (v: string) => void;
  region: string;
  onRegionChange: (v: string) => void;
  bucket: string;
  onBucketChange: (v: string) => void;
  accessKey: string;
  onAccessKeyChange: (v: string) => void;
  secretKey: string;
  onSecretKeyChange: (v: string) => void;
  forcePathStyle: boolean;
  onForcePathStyleChange: (v: boolean) => void;
  bucketPlaceholder?: string;
}

export function S3FieldGroup({
  endpoint,
  onEndpointChange,
  region,
  onRegionChange,
  bucket,
  onBucketChange,
  accessKey,
  onAccessKeyChange,
  secretKey,
  onSecretKeyChange,
  forcePathStyle,
  onForcePathStyleChange,
  bucketPlaceholder = "my-bucket",
}: S3FieldGroupProps) {
  const t = useT();

  return (
    <>
      <label className="block text-sm text-gray-700">
        {t("admin.settings.storageS3Endpoint")}
        <input
          value={endpoint}
          onChange={(e) => onEndpointChange(e.target.value)}
          placeholder="https://s3.amazonaws.com"
          className={INPUT_CLASS}
        />
      </label>
      <label className="block text-sm text-gray-700">
        {t("admin.settings.storageS3Region")}
        <input
          value={region}
          onChange={(e) => onRegionChange(e.target.value)}
          placeholder="us-east-1"
          className={INPUT_CLASS}
        />
      </label>
      <label className="block text-sm text-gray-700">
        {t("admin.settings.storageS3Bucket")}
        <input
          value={bucket}
          onChange={(e) => onBucketChange(e.target.value)}
          placeholder={bucketPlaceholder}
          className={INPUT_CLASS}
        />
      </label>
      <label className="block text-sm text-gray-700">
        {t("admin.settings.storageS3AccessKey")}
        <input
          value={accessKey}
          onChange={(e) => onAccessKeyChange(e.target.value)}
          placeholder="AKIA..."
          className={INPUT_CLASS}
        />
      </label>
      <label className="block text-sm text-gray-700">
        {t("admin.settings.storageS3SecretKey")}
        <input
          type="password"
          value={secretKey}
          onChange={(e) => onSecretKeyChange(e.target.value)}
          autoComplete="off"
          className={INPUT_CLASS}
        />
      </label>
      <SettingsCheckbox
        checked={forcePathStyle}
        onChange={onForcePathStyleChange}
        label={t("admin.settings.storageS3ForcePathStyle")}
        hint={t("admin.settings.storageS3ForcePathStyleHint")}
      />
    </>
  );
}
