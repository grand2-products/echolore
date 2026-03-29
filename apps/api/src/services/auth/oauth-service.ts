import { OAuth2Client } from "google-auth-library";
import { reconcileOAuthIdentity } from "../../repositories/auth/auth-repository.js";
import { getAuthSettings, resolveAllowedDomain } from "../admin/auth-settings-service.js";
import { findUserById, GOOGLE_PROVIDER, normalizeEmail, toSessionUser } from "./auth-utils.js";
import { buildAccessToken, issueRefreshToken } from "./token-service.js";

const googleClient = new OAuth2Client();

async function getGoogleAudiences() {
  const settings = await getAuthSettings();

  const audiences = [
    settings.googleClientId,
    settings.googleIosClientId,
    settings.googleAndroidClientId,
    ...(settings.googleOauthAudiences?.split(",") ?? []),
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (audiences.length === 0) {
    throw new Error("Google OAuth audience is not configured");
  }

  return Array.from(new Set(audiences));
}

export async function reconcileGoogleIdentity(input: { email: string; name: string }) {
  const email = normalizeEmail(input.email);

  const user = await reconcileOAuthIdentity({
    email,
    name: input.name,
    provider: GOOGLE_PROVIDER,
  });

  if (user.suspended_at || user.deleted_at) {
    throw new Error("Account is suspended or deleted");
  }

  return toSessionUser(user);
}

async function resolveGoogleUserFromIdToken(idToken: string) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: await getGoogleAudiences(),
  });
  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error("Google token payload is missing");
  }

  const email = payload?.email?.trim().toLowerCase();
  const name = payload?.name?.trim() || email?.split("@")[0] || "User";

  if (!email || payload.email_verified !== true) {
    throw new Error("Verified Google email is required");
  }

  const allowedDomain = await resolveAllowedDomain();
  if (allowedDomain) {
    const [, domain = ""] = email.split("@");
    if (domain !== allowedDomain) {
      throw new Error("Email domain is not allowed");
    }
  }

  return reconcileGoogleIdentity({ email, name });
}

export async function issueMobileTokenPair(input: { userId: string; deviceName?: string | null }) {
  const user = await findUserById(input.userId);
  if (!user) {
    throw new Error("User not found");
  }
  if (user.suspended_at || user.deleted_at) {
    throw new Error("Account is suspended or deleted");
  }

  const { accessToken, expiresAt } = buildAccessToken(user, "password");
  const refreshToken = await issueRefreshToken({
    userId: input.userId,
    clientType: "mobile",
    authMode: "password",
    deviceName: input.deviceName ?? null,
  });

  return {
    accessToken,
    refreshToken,
    expiresAt,
    user: toSessionUser(user),
    authMode: "password" as const,
  };
}

export async function exchangeGoogleIdToken(input: {
  idToken: string;
  deviceName?: string | null;
}) {
  const user = await resolveGoogleUserFromIdToken(input.idToken);
  const persistedUser = await findUserById(user.id);
  if (!persistedUser) {
    throw new Error("User not found after Google identity reconciliation");
  }
  if (persistedUser.suspended_at || persistedUser.deleted_at) {
    throw new Error("Account is suspended or deleted");
  }
  const { accessToken, expiresAt } = buildAccessToken(persistedUser, "sso");

  const refreshToken = await issueRefreshToken({
    userId: user.id,
    clientType: "mobile",
    authMode: "sso",
    deviceName: input.deviceName ?? null,
  });

  return {
    accessToken,
    refreshToken,
    expiresAt,
    user,
    authMode: "sso" as const,
  };
}
