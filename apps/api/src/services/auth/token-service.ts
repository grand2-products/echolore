import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { authRefreshTokens, users } from "../../db/schema.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_GRACE_SECONDS,
  SUPPORTED_AUTH_MODES,
  getSessionSecret,
  hashValue,
  toSessionUser,
  findUserById,
} from "./auth-utils.js";
import type {
  AccessTokenPayload,
  SupportedAuthMode,
  RefreshClientType,
  RefreshResult,
} from "./auth-utils.js";

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

export function buildAccessToken(user: typeof users.$inferSelect, authMode: SupportedAuthMode) {
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const accessToken = createSignedAccessToken({
    sub: user.id,
    ver: user.tokenVersion,
    am: authMode,
    exp: Math.floor(expiresAt.getTime() / 1000),
  });
  return { accessToken, expiresAt };
}

async function findActiveRefreshToken(rawRefreshToken: string) {
  const now = new Date();
  const tokenHash = hashValue(rawRefreshToken);

  // First try: non-revoked token
  const [active] = await db
    .select()
    .from(authRefreshTokens)
    .where(
      and(
        eq(authRefreshTokens.tokenHash, tokenHash),
        isNull(authRefreshTokens.revokedAt),
        gt(authRefreshTokens.expiresAt, now)
      )
    );
  if (active) return active;

  // Grace period: accept recently-revoked tokens for concurrent request tolerance.
  // Only valid if revoked within REFRESH_TOKEN_GRACE_SECONDS and not yet expired.
  const graceThreshold = new Date(now.getTime() - REFRESH_TOKEN_GRACE_SECONDS * 1000);
  const [graced] = await db
    .select()
    .from(authRefreshTokens)
    .where(
      and(
        eq(authRefreshTokens.tokenHash, tokenHash),
        gt(authRefreshTokens.revokedAt, graceThreshold),
        gt(authRefreshTokens.expiresAt, now)
      )
    );
  return graced ?? null;
}

export async function issueRefreshToken(input: {
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

export async function refreshAccessToken(input: {
  refreshToken: string;
  clientType: RefreshClientType;
  deviceName?: string | null;
}): Promise<RefreshResult | null> {
  const refreshRecord = await findActiveRefreshToken(input.refreshToken);
  if (!refreshRecord || refreshRecord.clientType !== input.clientType) {
    return null;
  }

  const user = await findUserById(refreshRecord.userId);
  if (!user) {
    return null;
  }

  const authMode = refreshRecord.authMode as SupportedAuthMode;

  // Grace period hit: token was already revoked and rotated.
  // Return a fresh access token but reuse the already-issued successor
  // refresh token instead of creating another one.
  if (refreshRecord.revokedAt) {
    const { accessToken, expiresAt } = buildAccessToken(user, authMode);
    const [successor] = await db
      .select()
      .from(authRefreshTokens)
      .where(
        and(
          eq(authRefreshTokens.rotatedFromId, refreshRecord.id),
          isNull(authRefreshTokens.revokedAt)
        )
      );
    // If successor was already revoked/missing, reject — the chain moved on
    if (!successor) {
      return null;
    }
    return {
      accessToken,
      refreshToken: null,
      expiresAt,
      user: toSessionUser(user),
      authMode,
    };
  }

  // Normal path: revoke old token and issue a new pair
  await db
    .update(authRefreshTokens)
    .set({ revokedAt: new Date(), lastSeenAt: new Date() })
    .where(eq(authRefreshTokens.id, refreshRecord.id));

  const { accessToken, expiresAt } = buildAccessToken(user, authMode);
  const nextRefreshToken = await issueRefreshToken({
    userId: user.id,
    clientType: input.clientType,
    authMode,
    deviceName: input.deviceName ?? refreshRecord.deviceName ?? null,
    rotatedFromId: refreshRecord.id,
  });

  return {
    accessToken,
    refreshToken: nextRefreshToken,
    expiresAt,
    user: toSessionUser(user),
    authMode,
  };
}

export async function revokeRefreshToken(rawRefreshToken: string | null | undefined) {
  if (!rawRefreshToken) {
    return;
  }

  const refreshRecord = await findActiveRefreshToken(rawRefreshToken);
  if (!refreshRecord || refreshRecord.revokedAt) {
    return;
  }

  await db
    .update(authRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(authRefreshTokens.id, refreshRecord.id));
}
