import { createSettingsCache } from "./create-settings-cache.js";

export interface AuthSettings {
  googleClientId: string | null;
  googleClientSecret: string | null;
  allowedDomain: string | null;
  googleIosClientId: string | null;
  googleAndroidClientId: string | null;
  googleOauthAudiences: string | null;
}

const cache = createSettingsCache<AuthSettings>({
  keys: [
    "authGoogleClientId",
    "authGoogleClientSecret",
    "authAllowedDomain",
    "authGoogleIosClientId",
    "authGoogleAndroidClientId",
    "authGoogleOauthAudiences",
  ],
  mapToSettings: (map) => ({
    googleClientId: map.authGoogleClientId || null,
    googleClientSecret: map.authGoogleClientSecret || null,
    allowedDomain: map.authAllowedDomain || null,
    googleIosClientId: map.authGoogleIosClientId || null,
    googleAndroidClientId: map.authGoogleAndroidClientId || null,
    googleOauthAudiences: map.authGoogleOauthAudiences || null,
  }),
  mapToKeyValues: (input) => ({
    authGoogleClientId: input.googleClientId ?? undefined,
    authGoogleClientSecret: input.googleClientSecret ?? undefined,
    authAllowedDomain: input.allowedDomain ?? undefined,
    authGoogleIosClientId: input.googleIosClientId ?? undefined,
    authGoogleAndroidClientId: input.googleAndroidClientId ?? undefined,
    authGoogleOauthAudiences: input.googleOauthAudiences ?? undefined,
  }),
});

export const getAuthSettings = cache.get;
export const updateAuthSettings = cache.update;

export async function resolveAllowedDomain(): Promise<string | null> {
  try {
    const settings = await getAuthSettings();
    return settings.allowedDomain?.toLowerCase() || null;
  } catch {
    return null;
  }
}
