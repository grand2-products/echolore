import {
  getSiteSetting,
  upsertSiteSetting,
} from "../../repositories/admin/admin-repository.js";

export interface AuthSettings {
  googleClientId: string | null;
  googleClientSecret: string | null;
  allowedDomain: string | null;
  googleIosClientId: string | null;
  googleAndroidClientId: string | null;
  googleOauthAudiences: string | null;
}

const AUTH_SETTING_KEYS = [
  "authGoogleClientId",
  "authGoogleClientSecret",
  "authAllowedDomain",
  "authGoogleIosClientId",
  "authGoogleAndroidClientId",
  "authGoogleOauthAudiences",
] as const;

const CACHE_TTL_MS = 60_000;
let cachedAuthSettings: AuthSettings | null = null;
let cacheExpiresAt = 0;

export async function getAuthSettings(): Promise<AuthSettings> {
  const now = Date.now();
  if (cachedAuthSettings && now < cacheExpiresAt) {
    return cachedAuthSettings;
  }

  const entries = await Promise.all(
    AUTH_SETTING_KEYS.map(async (key) => {
      const row = await getSiteSetting(key);
      return [key, row?.value ?? null] as const;
    }),
  );
  const map = Object.fromEntries(entries) as Record<string, string | null>;

  const settings: AuthSettings = {
    googleClientId: map.authGoogleClientId || null,
    googleClientSecret: map.authGoogleClientSecret || null,
    allowedDomain: map.authAllowedDomain || null,
    googleIosClientId: map.authGoogleIosClientId || null,
    googleAndroidClientId: map.authGoogleAndroidClientId || null,
    googleOauthAudiences: map.authGoogleOauthAudiences || null,
  };

  cachedAuthSettings = settings;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return settings;
}

function invalidateAuthSettingsCache() {
  cachedAuthSettings = null;
  cacheExpiresAt = 0;
}

export async function resolveAllowedDomain(): Promise<string | null> {
  try {
    const settings = await getAuthSettings();
    return settings.allowedDomain?.toLowerCase() || null;
  } catch {
    return null;
  }
}

export async function updateAuthSettings(input: Partial<AuthSettings>) {
  const keyMap: Record<string, string | undefined> = {
    authGoogleClientId: input.googleClientId ?? undefined,
    authGoogleClientSecret: input.googleClientSecret ?? undefined,
    authAllowedDomain: input.allowedDomain ?? undefined,
    authGoogleIosClientId: input.googleIosClientId ?? undefined,
    authGoogleAndroidClientId: input.googleAndroidClientId ?? undefined,
    authGoogleOauthAudiences: input.googleOauthAudiences ?? undefined,
  };

  for (const [key, value] of Object.entries(keyMap)) {
    if (value !== undefined) {
      await upsertSiteSetting(key, value);
    }
  }

  invalidateAuthSettingsCache();
  return getAuthSettings();
}
