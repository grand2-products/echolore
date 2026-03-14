import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { authRefreshTokens } from "../../db/schema.js";
import {
  hashValue,
  toSessionUser,
  findUserById,
} from "./auth-utils.js";
import type {
  ResolvedAccessTokenSession,
  AuthSessionRecord,
} from "./auth-utils.js";
import { parseSignedAccessToken } from "./token-service.js";

export async function resolveAccessTokenSession(input: { accessToken?: string | null }): Promise<ResolvedAccessTokenSession | null> {
  if (!input.accessToken) return null;

  const payload = parseSignedAccessToken(input.accessToken);
  if (!payload) return null;

  const user = await findUserById(payload.sub);
  if (!user || user.tokenVersion !== payload.ver) return null;

  return { user: toSessionUser(user), authMode: payload.am };
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
