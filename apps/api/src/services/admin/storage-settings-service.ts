import type { StorageProviderType, StorageProviderConfig } from "../../lib/file-storage.js";
import {
  getSiteSetting,
  upsertSiteSetting,
} from "../../repositories/admin/admin-repository.js";
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

const STORAGE_SETTING_KEYS = [
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
] as const;

export async function getStorageSettings(): Promise<StorageSettings> {
  const entries = await Promise.all(
    STORAGE_SETTING_KEYS.map(async (key) => {
      const row = await getSiteSetting(key);
      return [key, row?.value ?? null] as const;
    }),
  );
  const map = Object.fromEntries(entries) as Record<string, string | null>;

  return {
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
  };
}

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

export async function updateStorageSettings(input: Partial<StorageSettings>) {
  const keyMap: Record<string, string | undefined> = {
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
  };

  for (const [key, value] of Object.entries(keyMap)) {
    if (value !== undefined) {
      await upsertSiteSetting(key, value);
    }
  }

  return getStorageSettings();
}
