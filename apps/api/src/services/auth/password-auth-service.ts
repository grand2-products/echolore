import { randomBytes, createHash, createHmac, timingSafeEqual, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { OAuth2Client } from "google-auth-library";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { authIdentities, authRefreshTokens, emailVerificationTokens, users } from "../../db/schema.js";
import type { SessionUser } from "../../lib/auth.js";
import { sendPasswordVerificationEmail } from "../../lib/email.js";

const scrypt = promisify(scryptCallback);

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 15;
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 30;
const PASSWORD_PROVIDER = "password";
const GOOGLE_PROVIDER = "google";
const googleClient = new OAuth2Client();
const SUPPORTED_AUTH_MODES = ["password", "sso"] as const;
export type SupportedAuthMode = (typeof SUPPORTED_AUTH_MODES)[number];

export type AccessTokenPayload = {
  sub: string;
  ver: number;
  am: SupportedAuthMode;
  exp: number;
};

export type RefreshClientType = "web" | "mobile";

export type IssuedTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

export type ResolvedAccessTokenSession = {
  user: SessionUser;
  authMode: SupportedAuthMode;
};

export type AuthSessionRecord = {
  id: string;
  clientType: RefreshClientType;
  authMode: SupportedAuthMode;
  deviceName: string | null;
  createdAt: Date;
  lastSeenAt: Date | null;
  expiresAt: Date;
  current: boolean;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) {
    throw new Error("AUTH_SESSION_SECRET is required when password authentication is enabled");
  }
  return secret;
}

function getAppBaseUrl() {
  return process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:17720";
}

function getGoogleAudiences() {
  const audiences = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    ...(process.env.GOOGLE_OAUTH_AUDIENCES?.split(",") ?? []),
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  if (audiences.length === 0) {
    throw new Error("Google OAuth audience is not configured");
  }

  return Array.from(new Set(audiences));
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function toSessionUser(user: typeof users.$inferSelect): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role === "admin" ? "admin" : "member",
    avatarUrl: user.avatarUrl ?? null,
  };
}

export function createSignedAccessToken(payload: AccessTokenPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getSessionSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function parseSignedAccessToken(token: string): AccessTokenPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expectedSignature = createHmac("sha256", getSessionSecret()).update(body).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AccessTokenPayload;
    if (
      !parsed.sub ||
      typeof parsed.ver !== "number" ||
      !SUPPORTED_AUTH_MODES.includes(parsed.am) ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    if (parsed.exp <= Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password: string, passwordHash: string) {
  const [salt, storedHash] = passwordHash.split(":");
  if (!salt || !storedHash) return false;
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  const storedBuffer = Buffer.from(storedHash, "hex");
  if (derivedKey.length !== storedBuffer.length) return false;
  return timingSafeEqual(derivedKey, storedBuffer);
}

async function findUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, normalizeEmail(email)));
  return user ?? null;
}

async function findUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ?? null;
}

async function findActiveRefreshToken(rawRefreshToken: string) {
  const now = new Date();
  const [refreshToken] = await db
    .select()
    .from(authRefreshTokens)
    .where(
      and(
        eq(authRefreshTokens.tokenHash, hashValue(rawRefreshToken)),
        isNull(authRefreshTokens.revokedAt),
        gt(authRefreshTokens.expiresAt, now)
      )
    );
  return refreshToken ?? null;
}

function buildAccessToken(user: typeof users.$inferSelect, authMode: SupportedAuthMode) {
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const accessToken = createSignedAccessToken({
    sub: user.id,
    ver: user.tokenVersion,
    am: authMode,
    exp: Math.floor(expiresAt.getTime() / 1000),
  });
  return { accessToken, expiresAt };
}

async function issueRefreshToken(input: {
  userId: string;
  clientType: RefreshClientType;
  authMode: SupportedAuthMode;
  deviceName?: string | null;
  rotatedFromId?: string | null;
}) {
  const rawRefreshToken = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000);
  await db.insert(authRefreshTokens).values({
    id: `rt_${crypto.randomUUID()}`,
    userId: input.userId,
    clientType: input.clientType,
    authMode: input.authMode,
    deviceName: input.deviceName ?? null,
    tokenHash: hashValue(rawRefreshToken),
    expiresAt,
    rotatedFromId: input.rotatedFromId ?? null,
    revokedAt: null,
    lastSeenAt: now,
    createdAt: now,
  });
  return rawRefreshToken;
}

export async function reconcileGoogleIdentity(input: { email: string; name: string }) {
  const email = normalizeEmail(input.email);
  const now = new Date();

  return db.transaction(async (tx) => {
    let [user] = await tx.select().from(users).where(eq(users.email, email));

    if (!user) {
      [user] = await tx
        .insert(users)
        .values({
          id: `user_${crypto.randomUUID()}`,
          email,
          name: input.name,
          avatarUrl: null,
          emailVerifiedAt: now,
          tokenVersion: 1,
          role: "member",
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
      .where(and(eq(authIdentities.provider, GOOGLE_PROVIDER), eq(authIdentities.providerUserId, email)));

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

export async function registerPasswordUser(input: { email: string; name: string; password: string }) {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS);
  const pendingPasswordHash = await hashPassword(input.password);
  const verificationToken = randomBytes(32).toString("base64url");
  const tokenHash = hashValue(verificationToken);
  const existingUser = await findUserByEmail(email);

  if (!name) {
    throw new Error("Name is required");
  }

  const [existingPasswordIdentity] = existingUser
    ? await db
        .select()
        .from(authIdentities)
        .where(and(eq(authIdentities.userId, existingUser.id), eq(authIdentities.provider, PASSWORD_PROVIDER)))
    : [];

  if (existingUser?.emailVerifiedAt && existingPasswordIdentity) {
    throw new Error("Password login is already configured for this email address");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(emailVerificationTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(emailVerificationTokens.email, email),
          eq(emailVerificationTokens.purpose, "password-registration"),
          isNull(emailVerificationTokens.usedAt)
        )
      );

    await tx.insert(emailVerificationTokens).values({
      id: `evt_${crypto.randomUUID()}`,
      userId: existingUser?.id ?? null,
      email,
      tokenHash,
      purpose: "password-registration",
      pendingName: existingUser ? null : name,
      pendingPasswordHash,
      expiresAt,
      usedAt: null,
      createdAt: now,
    });
  });

  const verificationUrl = `${getAppBaseUrl()}/login?verify=${encodeURIComponent(verificationToken)}`;
  await sendPasswordVerificationEmail({ email, verificationUrl, expiresAt });

  return { expiresAt };
}

export async function verifyEmailRegistrationToken(token: string) {
  const tokenHash = hashValue(token);
  const now = new Date();
  const [verification] = await db
    .select()
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.tokenHash, tokenHash),
        eq(emailVerificationTokens.purpose, "password-registration"),
        isNull(emailVerificationTokens.usedAt),
        gt(emailVerificationTokens.expiresAt, now)
      )
    );

  if (!verification || !verification.pendingPasswordHash) {
    return null;
  }

  return db.transaction(async (tx) => {
    let user = verification.userId
      ? (await tx.select().from(users).where(eq(users.id, verification.userId)))[0] ?? null
      : null;

    if (!user) {
      user = (await tx.select().from(users).where(eq(users.email, verification.email)))[0] ?? null;
    }

    if (!user) {
      const [createdUser] = await tx
        .insert(users)
        .values({
          id: `user_${crypto.randomUUID()}`,
          email: verification.email,
          name: verification.pendingName || verification.email.split("@")[0] || "User",
          avatarUrl: null,
          emailVerifiedAt: now,
          tokenVersion: 1,
          role: "member",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      user = createdUser ?? null;
    } else {
      const [updatedUser] = await tx
        .update(users)
        .set({
          emailVerifiedAt: user.emailVerifiedAt ?? now,
          updatedAt: now,
        })
        .where(eq(users.id, user.id))
        .returning();
      user = updatedUser ?? user;
    }

    if (!user) {
      throw new Error("Failed to create user during verification");
    }

    const [passwordIdentity] = await tx
      .select()
      .from(authIdentities)
      .where(and(eq(authIdentities.userId, user.id), eq(authIdentities.provider, PASSWORD_PROVIDER)));

    if (passwordIdentity) {
      await tx
        .update(authIdentities)
        .set({
          passwordHash: verification.pendingPasswordHash,
          updatedAt: now,
        })
        .where(eq(authIdentities.id, passwordIdentity.id));
    } else {
      await tx.insert(authIdentities).values({
        id: `auth_${crypto.randomUUID()}`,
        userId: user.id,
        provider: PASSWORD_PROVIDER,
        providerUserId: user.email,
        passwordHash: verification.pendingPasswordHash,
        createdAt: now,
        updatedAt: now,
      });
    }

    await tx
      .update(emailVerificationTokens)
      .set({ usedAt: now })
      .where(eq(emailVerificationTokens.id, verification.id));

    return toSessionUser(user);
  });
}

export async function authenticatePasswordUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const rows = await db
    .select({
      user: users,
      identity: authIdentities,
    })
    .from(authIdentities)
    .innerJoin(users, eq(authIdentities.userId, users.id))
    .where(and(eq(users.email, normalizedEmail), eq(authIdentities.provider, PASSWORD_PROVIDER)));

  const record = rows[0];
  if (!record?.identity.passwordHash || !record.user.emailVerifiedAt) {
    return null;
  }

  const isValid = await verifyPassword(password, record.identity.passwordHash);
  if (!isValid) {
    return null;
  }

  return toSessionUser(record.user);
}

export async function issuePasswordWebTokenSet(userId: string): Promise<IssuedTokenSet> {
  const user = await findUserById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const { accessToken, expiresAt } = buildAccessToken(user, "password");
  const refreshToken = await issueRefreshToken({ userId, clientType: "web", authMode: "password" });
  return { accessToken, refreshToken, expiresAt };
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

export async function exchangeGoogleIdToken(input: { idToken: string; deviceName?: string | null }) {
  const ticket = await googleClient.verifyIdToken({
    idToken: input.idToken,
    audience: getGoogleAudiences(),
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

  const user = await reconcileGoogleIdentity({ email, name });
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

export async function refreshAccessToken(input: {
  refreshToken: string;
  clientType: RefreshClientType;
  deviceName?: string | null;
}) {
  const refreshRecord = await findActiveRefreshToken(input.refreshToken);
  if (!refreshRecord || refreshRecord.clientType !== input.clientType) {
    return null;
  }

  const user = await findUserById(refreshRecord.userId);
  if (!user) {
    return null;
  }

  await db
    .update(authRefreshTokens)
    .set({ revokedAt: new Date(), lastSeenAt: new Date() })
    .where(eq(authRefreshTokens.id, refreshRecord.id));

  const { accessToken, expiresAt } = buildAccessToken(user, refreshRecord.authMode as SupportedAuthMode);
  const nextRefreshToken = await issueRefreshToken({
    userId: user.id,
    clientType: input.clientType,
    authMode: refreshRecord.authMode as SupportedAuthMode,
    deviceName: input.deviceName ?? refreshRecord.deviceName ?? null,
    rotatedFromId: refreshRecord.id,
  });

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    expiresAt,
    user: toSessionUser(user),
    authMode: refreshRecord.authMode as SupportedAuthMode,
  };
}

export async function revokeRefreshToken(rawRefreshToken: string | null | undefined) {
  if (!rawRefreshToken) {
    return;
  }

  const refreshRecord = await findActiveRefreshToken(rawRefreshToken);
  if (!refreshRecord) {
    return;
  }

  await db
    .update(authRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(authRefreshTokens.id, refreshRecord.id));
}

export async function resolveAccessTokenSession(input: { accessToken?: string | null }): Promise<ResolvedAccessTokenSession | null> {
  if (!input.accessToken) return null;

  const payload = parseSignedAccessToken(input.accessToken);
  if (!payload) return null;

  const user = await findUserById(payload.sub);
  if (!user || user.tokenVersion !== payload.ver) return null;

  return { user: toSessionUser(user), authMode: payload.am };
}

export async function getPasswordSessionUser(input: { accessToken?: string | null }) {
  const session = await resolveAccessTokenSession(input);
  if (!session || session.authMode !== "password") {
    return null;
  }
  return session.user;
}

export async function listAuthSessionsForUser(input: { userId: string; currentRefreshToken?: string | null }) {
  const now = new Date();
  const currentHash = input.currentRefreshToken ? hashValue(input.currentRefreshToken) : null;
  const sessions = await db
    .select()
    .from(authRefreshTokens)
    .where(
      and(
        eq(authRefreshTokens.userId, input.userId),
        isNull(authRefreshTokens.revokedAt),
        gt(authRefreshTokens.expiresAt, now)
      )
    )
    .orderBy(desc(authRefreshTokens.createdAt));

  return sessions.map(
    (session): AuthSessionRecord => ({
      id: session.id,
      clientType: session.clientType === "mobile" ? "mobile" : "web",
      authMode: session.authMode === "sso" ? "sso" : "password",
      deviceName: session.deviceName ?? null,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt ?? null,
      expiresAt: session.expiresAt,
      current: currentHash ? session.tokenHash === currentHash : false,
    })
  );
}

export async function revokeAuthSessionById(input: { userId: string; sessionId: string }) {
  const now = new Date();
  const [session] = await db
    .select()
    .from(authRefreshTokens)
    .where(
      and(
        eq(authRefreshTokens.id, input.sessionId),
        eq(authRefreshTokens.userId, input.userId),
        isNull(authRefreshTokens.revokedAt)
      )
    );

  if (!session) {
    return false;
  }

  await db
    .update(authRefreshTokens)
    .set({ revokedAt: now })
    .where(eq(authRefreshTokens.id, session.id));
  return true;
}
