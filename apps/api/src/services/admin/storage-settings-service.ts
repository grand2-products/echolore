import type { StorageProviderType, StorageProviderConfig } from "../../lib/file-storage.js";
import { createSettingsCache } from "./create-settings-cache.js";
import { getGcpCredentials } from "./gcp-credentials-service.js";

export interface StorageSettings {
  provider: StorageProviderType;
  localPath: string | null;
  s3Endpoint: string | null;
  s3Region: string | null;
  s3Bucket: string | null;
  s3AccessKey: string | null;
  s3SecretKey: string | null;
  s3ForcePathStyle: boolean;
  gcsBucket: string | null;
  gcsUseGcpDefaults: boolean;
  gcsProjectId: string | null;
  gcsKeyJson: string | null;
}

const cache = createSettingsCache<StorageSettings>({
  keys: [
    "storageProvider",
    "storageLocalPath",
    "storageS3Endpoint",
    "storageS3Region",
    "storageS3Bucket",
    "storageS3AccessKey",
    "storageS3SecretKey",
    "storageS3ForcePathStyle",
    "storageGcsBucket",
    "storageGcsUseGcpDefaults",
    "storageGcsProjectId",
    "storageGcsKeyJson",
  ],
  cacheTtlMs: false,
  mapToSettings: (map) => ({
    provider: (map.storageProvider as StorageProviderType) || "local",
    localPath: map.storageLocalPath || null,
    s3Endpoint: map.storageS3Endpoint || null,
    s3Region: map.storageS3Region || null,
    s3Bucket: map.storageS3Bucket || null,
    s3AccessKey: map.storageS3AccessKey || null,
    s3SecretKey: map.storageS3SecretKey || null,
    s3ForcePathStyle: map.storageS3ForcePathStyle === "false" ? false : true,
    gcsBucket: map.storageGcsBucket || null,
    gcsUseGcpDefaults: map.storageGcsUseGcpDefaults !== "false",
    gcsProjectId: map.storageGcsProjectId || null,
    gcsKeyJson: map.storageGcsKeyJson || null,
  }),
  mapToKeyValues: (input) => ({
    storageProvider: input.provider,
    storageLocalPath: input.localPath ?? undefined,
    storageS3Endpoint: input.s3Endpoint ?? undefined,
    storageS3Region: input.s3Region ?? undefined,
    storageS3Bucket: input.s3Bucket ?? undefined,
    storageS3AccessKey: input.s3AccessKey ?? undefined,
    storageS3SecretKey: input.s3SecretKey ?? undefined,
    storageS3ForcePathStyle: input.s3ForcePathStyle !== undefined ? String(input.s3ForcePathStyle) : undefined,
    storageGcsBucket: input.gcsBucket ?? undefined,
    storageGcsUseGcpDefaults: input.gcsUseGcpDefaults !== undefined ? String(input.gcsUseGcpDefaults) : undefined,
    storageGcsProjectId: input.gcsProjectId ?? undefined,
    storageGcsKeyJson: input.gcsKeyJson ?? undefined,
  }),
});

export const getStorageSettings = cache.get;
export const updateStorageSettings = cache.update;

export async function buildStorageConfig(settings: StorageSettings): Promise<StorageProviderConfig> {
  let gcsProjectId = settings.gcsProjectId ?? undefined;
  let gcsKeyJson = settings.gcsKeyJson ?? undefined;

  if (settings.provider === "gcs" && settings.gcsUseGcpDefaults) {
    try {
      const gcpCreds = await getGcpCredentials();
      gcsProjectId = gcpCreds.gcpProjectId ?? undefined;
      gcsKeyJson = gcpCreds.gcpServiceAccountKeyJson ?? undefined;
    } catch { /* fall through to ADC */ }
  }

  return {
    provider: settings.provider,
    localPath: settings.localPath ?? undefined,
    s3Endpoint: settings.s3Endpoint ?? undefined,
    s3Region: settings.s3Region ?? undefined,
    s3Bucket: settings.s3Bucket ?? undefined,
    s3AccessKey: settings.s3AccessKey ?? undefined,
    s3SecretKey: settings.s3SecretKey ?? undefined,
    s3ForcePathStyle: settings.s3ForcePathStyle,
    gcsBucket: settings.gcsBucket ?? undefined,
    gcsProjectId,
    gcsKeyJson,
  };
}
