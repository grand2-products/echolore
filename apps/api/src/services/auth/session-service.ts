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
  if (!user || user.token_version !== payload.ver) return null;
  if (user.suspended_at || user.deleted_at) return null;

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
      clientType: session.client_type === "mobile" ? "mobile" : "web",
      authMode: session.auth_mode === "sso" ? "sso" : "password",
      deviceName: session.device_name ?? null,
      createdAt: session.created_at,
      lastSeenAt: session.last_seen_at ?? null,
      expiresAt: session.expires_at,
      current: currentHash ? session.token_hash === currentHash : false,
    })
  );
}

export async function revokeAuthSessionById(input: { userId: string; sessionId: string }) {
  const session = await getAuthRefreshTokenById(input.sessionId);

  if (!session || session.user_id !== input.userId || session.revoked_at) {
    return false;
  }

  await revokeAuthRefreshToken(input.sessionId, new Date());
  return true;
}
