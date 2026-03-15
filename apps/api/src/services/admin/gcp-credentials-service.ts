import {
  getSiteSetting,
  upsertSiteSetting,
} from "../../repositories/admin/admin-repository.js";

export interface GcpCredentials {
  gcpProjectId: string | null;
  gcpServiceAccountKeyJson: string | null;
}

const GCP_SETTING_KEYS = [
  "gcpProjectId",
  "gcpServiceAccountKeyJson",
] as const;

const CACHE_TTL_MS = 60_000;
let cachedGcpCredentials: GcpCredentials | null = null;
let cacheExpiresAt = 0;

export async function getGcpCredentials(): Promise<GcpCredentials> {
  const now = Date.now();
  if (cachedGcpCredentials && now < cacheExpiresAt) {
    return cachedGcpCredentials;
  }

  const entries = await Promise.all(
    GCP_SETTING_KEYS.map(async (key) => {
      const row = await getSiteSetting(key);
      return [key, row?.value ?? null] as const;
    }),
  );
  const map = Object.fromEntries(entries) as Record<string, string | null>;

  const credentials: GcpCredentials = {
    gcpProjectId: map.gcpProjectId || null,
    gcpServiceAccountKeyJson: map.gcpServiceAccountKeyJson || null,
  };

  cachedGcpCredentials = credentials;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return credentials;
}

function invalidateGcpCredentialsCache() {
  cachedGcpCredentials = null;
  cacheExpiresAt = 0;
}

export async function updateGcpCredentials(input: Partial<GcpCredentials>) {
  const keyMap: Record<string, string | undefined> = {
    gcpProjectId: input.gcpProjectId ?? undefined,
    gcpServiceAccountKeyJson: input.gcpServiceAccountKeyJson ?? undefined,
  };

  for (const [key, value] of Object.entries(keyMap)) {
    if (value !== undefined) {
      await upsertSiteSetting(key, value);
    }
  }

  invalidateGcpCredentialsCache();
  return getGcpCredentials();
}
