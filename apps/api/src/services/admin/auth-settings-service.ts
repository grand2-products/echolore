import { createTypedSettingsService, FieldCodecs, field } from "./create-settings-cache.js";

export interface AuthSettings {
  googleClientId: string | null;
  googleClientSecret: string | null;
  allowedDomain: string | null;
  googleIosClientId: string | null;
  googleAndroidClientId: string | null;
  googleOauthAudiences: string | null;
}

const cache = createTypedSettingsService(
  {
    googleClientId: field("authGoogleClientId", FieldCodecs.nullable),
    googleClientSecret: field("authGoogleClientSecret", FieldCodecs.nullable),
    allowedDomain: field("authAllowedDomain", FieldCodecs.nullable),
    googleIosClientId: field("authGoogleIosClientId", FieldCodecs.nullable),
    googleAndroidClientId: field("authGoogleAndroidClientId", FieldCodecs.nullable),
    googleOauthAudiences: field("authGoogleOauthAudiences", FieldCodecs.nullable),
  },
  { encryptedKeys: ["authGoogleClientSecret"] }
);

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
