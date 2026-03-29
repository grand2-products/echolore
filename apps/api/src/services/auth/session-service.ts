import {
  getAuthRefreshTokenById,
  listAuthRefreshTokens,
  revokeAuthRefreshToken,
} from "../../repositories/auth/auth-repository.js";
import type { AuthSessionRecord, ResolvedAccessTokenSession } from "./auth-utils.js";
import { findUserById, hashValue, toSessionUser } from "./auth-utils.js";
import { parseSignedAccessToken } from "./token-service.js";

export async function resolveAccessTokenSession(input: {
  accessToken?: string | null;
}): Promise<ResolvedAccessTokenSession | null> {
  if (!input.accessToken) return null;

  const payload = parseSignedAccessToken(input.accessToken);
  if (!payload) return null;

  const user = await findUserById(payload.sub);
  if (!user || user.tokenVersion !== payload.ver) return null;
  if (user.suspendedAt || user.deletedAt) return null;

  return { user: toSessionUser(user), authMode: payload.am };
}

export async function listAuthSessionsForUser(input: {
  userId: string;
  currentRefreshToken?: string | null;
}) {
  const currentHash = input.currentRefreshToken ? hashValue(input.currentRefreshToken) : null;
  const sessions = await listAuthRefreshTokens(input.userId);

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
  const session = await getAuthRefreshTokenById(input.sessionId);

  if (!session || session.userId !== input.userId || session.revokedAt) {
    return false;
  }

  await revokeAuthRefreshToken(input.sessionId, new Date());
  return true;
}
