import { createTypedSettingsService, FieldCodecs, field } from "./create-settings-cache.js";
import { resolveGcpCredentials } from "./resolve-gcp-config.js";

export type BackupProviderType = "gcs" | "s3";

export interface BackupSettings {
  provider: string | null;
  retentionDays: number | null;
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
  slackWebhookUrl: string | null;
}

export interface BackupStorageConfig {
  provider: BackupProviderType;
  s3Endpoint?: string;
  s3Region?: string;
  s3Bucket?: string;
  s3AccessKey?: string;
  s3SecretKey?: string;
  s3ForcePathStyle?: boolean;
  gcsBucket?: string;
  gcsProjectId?: string;
  gcsKeyJson?: string;
}

const cache = createTypedSettingsService(
  {
    provider: field("backupProvider", FieldCodecs.nullable),
    retentionDays: field("backupRetentionDays", FieldCodecs.nullableNumber),
    s3Endpoint: field("backupS3Endpoint", FieldCodecs.nullable),
    s3Region: field("backupS3Region", FieldCodecs.nullable),
    s3Bucket: field("backupS3Bucket", FieldCodecs.nullable),
    s3AccessKey: field("backupS3AccessKey", FieldCodecs.nullable),
    s3SecretKey: field("backupS3SecretKey", FieldCodecs.nullable),
    s3ForcePathStyle: field("backupS3ForcePathStyle", FieldCodecs.boolTrue),
    gcsBucket: field("backupGcsBucket", FieldCodecs.nullable),
    gcsUseGcpDefaults: field("backupGcsUseGcpDefaults", FieldCodecs.boolTrue),
    gcsProjectId: field("backupGcsProjectId", FieldCodecs.nullable),
    gcsKeyJson: field("backupGcsKeyJson", FieldCodecs.nullable),
    slackWebhookUrl: field("backupSlackWebhookUrl", FieldCodecs.nullable),
  },
  { cacheTtlMs: 10_000 }
);

export const getBackupSettings: () => Promise<BackupSettings> = cache.get;
export const updateBackupSettings: (input: Partial<BackupSettings>) => Promise<BackupSettings> =
  cache.update;

const VALID_PROVIDERS = new Set<string>(["gcs", "s3"]);

export async function buildBackupStorageConfig(
  settings: BackupSettings
): Promise<BackupStorageConfig> {
  if (!settings.provider || !VALID_PROVIDERS.has(settings.provider)) {
    throw new Error(`Invalid backup provider: ${settings.provider}`);
  }
  const provider = settings.provider as BackupProviderType;

  const { gcsProjectId, gcsKeyJson } = await resolveGcpCredentials(
    provider === "gcs" && settings.gcsUseGcpDefaults,
    settings.gcsProjectId,
    settings.gcsKeyJson
  );

  return {
    provider,
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
