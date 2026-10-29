import { nanoid } from "nanoid";
import { db } from "../../db/index.js";
import type { OAuthAuthorizationCode, OAuthClient, OAuthRefreshToken } from "../../db/schema.js";

// ─── Clients (RFC 7591 dynamic registration) ──────────────────────

export async function createOAuthClientRow(input: {
  clientName: string;
  redirectUris: string[];
}): Promise<OAuthClient> {
  const now = new Date();
  return db
    .insertInto("oauth_clients")
    .values({
      id: `ech_cli_${nanoid(16)}`,
      clientName: input.clientName,
      redirectUris: input.redirectUris,
      createdAt: now,
      updatedAt: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function findOAuthClientById(id: string): Promise<OAuthClient | null> {
  return (
    (await db.selectFrom("oauth_clients").selectAll().where("id", "=", id).executeTakeFirst()) ??
    null
  );
}

// ─── Authorization codes (single-use, PKCE) ───────────────────────

export async function createAuthorizationCodeRow(input: {
  codeHash: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string;
  expiresAt: Date;
}): Promise<OAuthAuthorizationCode> {
  return db
    .insertInto("oauth_authorization_codes")
    .values({
      id: `oac_${nanoid(16)}`,
      codeHash: input.codeHash,
      clientId: input.clientId,
      userId: input.userId,
      redirectUri: input.redirectUri,
      scopes: input.scopes,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: "S256",
      expiresAt: input.expiresAt,
      consumedAt: null,
      createdAt: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function findUnconsumedAuthorizationCodeByHash(
  codeHash: string
): Promise<OAuthAuthorizationCode | null> {
  return (
    (await db
      .selectFrom("oauth_authorization_codes")
      .selectAll()
      .where("codeHash", "=", codeHash)
      .where("consumedAt", "is", null)
      .where("expiresAt", ">", new Date())
      .executeTakeFirst()) ?? null
  );
}

export async function consumeAuthorizationCodeRow(id: string): Promise<void> {
  await db
    .updateTable("oauth_authorization_codes")
    .set({ consumedAt: new Date() })
    .where("id", "=", id)
    .execute();
}

// ─── Refresh tokens (rotating) ────────────────────────────────────

export async function createRefreshTokenRow(input: {
  tokenHash: string;
  agentTokenId: string;
  clientId: string;
  expiresAt: Date;
}): Promise<OAuthRefreshToken> {
  return db
    .insertInto("oauth_refresh_tokens")
    .values({
      id: `ort_${nanoid(16)}`,
      tokenHash: input.tokenHash,
      agentTokenId: input.agentTokenId,
      clientId: input.clientId,
      expiresAt: input.expiresAt,
      revokedAt: null,
      createdAt: new Date(),
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function findActiveRefreshTokenByHash(
  tokenHash: string
): Promise<OAuthRefreshToken | null> {
  return (
    (await db
      .selectFrom("oauth_refresh_tokens")
      .selectAll()
      .where("tokenHash", "=", tokenHash)
      .where("revokedAt", "is", null)
      .where("expiresAt", ">", new Date())
      .executeTakeFirst()) ?? null
  );
}

export async function revokeRefreshTokenRow(id: string): Promise<void> {
  await db
    .updateTable("oauth_refresh_tokens")
    .set({ revokedAt: new Date() })
    .where("id", "=", id)
    .execute();
}
