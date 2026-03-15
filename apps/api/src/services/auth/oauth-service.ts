import { UserRole } from "@corp-internal/shared/contracts";
import { and, count, eq } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import { db } from "../../db/index.js";
import { authIdentities, users } from "../../db/schema.js";
import { getAuthSettings, resolveAllowedDomain } from "../admin/auth-settings-service.js";
import { GOOGLE_PROVIDER, findUserById, normalizeEmail, toSessionUser } from "./auth-utils.js";
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
  const now = new Date();

  return db.transaction(async (tx) => {
    let [user] = await tx.select().from(users).where(eq(users.email, email));

    if (!user) {
      const [countRow] = await tx.select({ value: count() }).from(users);
      if ((countRow?.value ?? 0) !== 0) {
        throw new Error("Registration is closed");
      }
      [user] = await tx
        .insert(users)
        .values({
          id: `user_${crypto.randomUUID()}`,
          email,
          name: input.name,
          avatarUrl: null,
          emailVerifiedAt: now,
          tokenVersion: 1,
          role: UserRole.Admin,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
    } else {
      const nextName = user.name?.trim() ? user.name : input.name;
      const [updatedUser] = await tx
        .update(users)
        .set({
          name: nextName,
          emailVerifiedAt: user.emailVerifiedAt ?? now,
          updatedAt: now,
        })
        .where(eq(users.id, user.id))
        .returning();
      user = updatedUser ?? user;
    }

    if (!user) {
      throw new Error("Failed to reconcile Google identity");
    }

    const [existingIdentity] = await tx
      .select()
      .from(authIdentities)
      .where(
        and(eq(authIdentities.provider, GOOGLE_PROVIDER), eq(authIdentities.providerUserId, email))
      );

    if (!existingIdentity) {
      await tx.insert(authIdentities).values({
        id: `auth_${crypto.randomUUID()}`,
        userId: user.id,
        provider: GOOGLE_PROVIDER,
        providerUserId: email,
        passwordHash: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    return toSessionUser(user);
  });
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

export async function issueMobileTokenPair(input: {
  userId: string;
  deviceName?: string | null;
}) {
  const user = await findUserById(input.userId);
  if (!user) {
    throw new Error("User not found");
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
