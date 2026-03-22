import type { StorageProviderConfig, StorageProviderType } from "../../lib/file-storage.js";
import { createTypedSettingsService, FieldCodecs, field } from "./create-settings-cache.js";
import { resolveGcpCredentials } from "./resolve-gcp-config.js";

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

const cache = createTypedSettingsService(
  {
    provider: field("storageProvider", FieldCodecs.withDefault<StorageProviderType>("local")),
    localPath: field("storageLocalPath", FieldCodecs.nullable),
    s3Endpoint: field("storageS3Endpoint", FieldCodecs.nullable),
    s3Region: field("storageS3Region", FieldCodecs.nullable),
    s3Bucket: field("storageS3Bucket", FieldCodecs.nullable),
    s3AccessKey: field("storageS3AccessKey", FieldCodecs.nullable),
    s3SecretKey: field("storageS3SecretKey", FieldCodecs.nullable),
    s3ForcePathStyle: field("storageS3ForcePathStyle", FieldCodecs.boolTrue),
    gcsBucket: field("storageGcsBucket", FieldCodecs.nullable),
    gcsUseGcpDefaults: field("storageGcsUseGcpDefaults", FieldCodecs.boolTrue),
    gcsProjectId: field("storageGcsProjectId", FieldCodecs.nullable),
    gcsKeyJson: field("storageGcsKeyJson", FieldCodecs.nullable),
  },
  { cacheTtlMs: false }
);

export const getStorageSettings = cache.get;
export const updateStorageSettings = cache.update;

export async function buildStorageConfig(
  settings: StorageSettings
): Promise<StorageProviderConfig> {
  const { gcsProjectId, gcsKeyJson } = await resolveGcpCredentials(
    settings.provider === "gcs" && settings.gcsUseGcpDefaults,
    settings.gcsProjectId,
    settings.gcsKeyJson
  );

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
