import { createTypedSettingsService, FieldCodecs, field } from "./create-settings-cache.js";

export interface GithubSettings {
  githubEnabled: boolean;
  githubAppId: string | null;
  githubAppPrivateKey: string | null;
  githubWebhookSecret: string | null;
  syncIntervalMinutes: number | null;
  maxFileSizeBytes: number | null;
}

const cache = createTypedSettingsService(
  {
    githubEnabled: field("githubEnabled", FieldCodecs.boolFalse),
    githubAppId: field("githubAppId", FieldCodecs.nullable),
    githubAppPrivateKey: field("githubAppPrivateKey", FieldCodecs.nullable),
    githubWebhookSecret: field("githubWebhookSecret", FieldCodecs.nullable),
    syncIntervalMinutes: field("githubSyncIntervalMinutes", FieldCodecs.nullableNumber),
    maxFileSizeBytes: field("githubMaxFileSizeBytes", FieldCodecs.nullableNumber),
  },
  { encryptedKeys: ["githubAppPrivateKey", "githubWebhookSecret"] }
);

export const getGithubSettings = cache.get;
export const updateGithubSettings = cache.update;

export interface ResolvedGithubSettings {
  enabled: boolean;
  appId: string;
  appPrivateKey: string;
  webhookSecret: string;
  syncIntervalMinutes: number;
  maxFileSizeBytes: number;
}

export async function getResolvedGithubSettings(): Promise<ResolvedGithubSettings> {
  const s = await getGithubSettings();
  return {
    enabled: s.githubEnabled,
    appId: s.githubAppId ?? "",
    appPrivateKey: s.githubAppPrivateKey ?? "",
    webhookSecret: s.githubWebhookSecret ?? "",
    syncIntervalMinutes: s.syncIntervalMinutes ?? 60,
    maxFileSizeBytes: s.maxFileSizeBytes ?? 10 * 1024 * 1024,
  };
}
