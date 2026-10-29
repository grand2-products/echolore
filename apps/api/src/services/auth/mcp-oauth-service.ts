import { createHash, randomBytes } from "node:crypto";
import type { OAuthClient } from "../../db/schema.js";
import { writeAuditLog } from "../../lib/audit.js";
import { findAgentTokenById } from "../../repositories/admin/agent-token-repository.js";
import {
  consumeAuthorizationCodeRow,
  createAuthorizationCodeRow,
  createOAuthClientRow,
  createRefreshTokenRow,
  findActiveRefreshTokenByHash,
  findOAuthClientById,
  findUnconsumedAuthorizationCodeByHash,
  revokeRefreshTokenRow,
} from "../../repositories/auth/oauth-repository.js";
import {
  createAgentToken,
  hashAgentTokenSecret,
  rotateAgentTokenSecret,
} from "../admin/agent-token-service.js";

/**
 * OAuth 2.1 authorization server for MCP clients (authorization code + PKCE,
 * dynamic client registration, refresh token rotation). Access tokens are
 * ordinary agent tokens (`ech_agt_...`) so /mcp treats OAuth and admin-issued
 * tokens identically.
 */

export const OAUTH_ACCESS_TOKEN_TTL_DAYS = 30;
export const OAUTH_REFRESH_TOKEN_TTL_DAYS = 90;
export const OAUTH_CODE_TTL_MS = 5 * 60_000;

/** OAuth protocol error carrying the RFC 6749 error code. */
export class OAuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number = 400
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

// ─── PKCE ──────────────────────────────────────────────────────────

export function pkceS256Challenge(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

// ─── Client registration (RFC 7591) ────────────────────────────────

export function isValidRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (parsed.hash) return false;
    if (parsed.protocol === "https:") return true;
    // Loopback plain HTTP is allowed for local development per RFC 8252
    if (parsed.protocol === "http:") {
      return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    }
    return false;
  } catch {
    return false;
  }
}

export async function registerOAuthClient(input: {
  clientName: string;
  redirectUris: string[];
}): Promise<OAuthClient> {
  const client = await createOAuthClientRow(input);
  await writeAuditLog({
    action: "oauth.client.registered",
    resourceType: "oauth-client",
    resourceId: client.id,
    metadata: { clientName: client.clientName, redirectUris: client.redirectUris },
  });
  return client;
}

// ─── Authorization endpoint ────────────────────────────────────────

export function parseScopeParam(scope: string | undefined | null): string[] | null {
  if (!scope) return []; // empty scope defaults to read-only, decided by the caller
  const requested = scope.split(/[\s+]+/).filter(Boolean);
  if (requested.length === 0) return [];
  const invalid = requested.filter((s) => !(["read", "write"] as const).includes(s as never));
  if (invalid.length > 0) return null;
  return [...new Set(requested)];
}

export interface AuthorizeRequestInput {
  clientId: string;
  redirectUri: string;
  responseType: string;
  scope: string | undefined;
  state: string | undefined;
  codeChallenge: string | undefined;
  codeChallengeMethod: string | undefined;
}

export interface ValidatedAuthorizeRequest {
  client: OAuthClient;
  redirectUri: string;
  scopes: string[];
  state: string | null;
  codeChallenge: string;
}

/**
 * Validate an authorization request. `redirectSafe` on the returned error
 * indicates the redirect_uri was verified and the error may be sent back via
 * redirect (per RFC 6749 §4.1.2.1); otherwise the client must not be redirected.
 */
export async function validateAuthorizeRequest(
  input: AuthorizeRequestInput
): Promise<
  | { ok: true; value: ValidatedAuthorizeRequest }
  | { ok: false; error: OAuthError; redirectSafe: boolean }
> {
  const client = await findOAuthClientById(input.clientId);
  if (!client) {
    return {
      ok: false,
      redirectSafe: false,
      error: new OAuthError("Unknown client", "invalid_client", 400),
    };
  }

  if (!client.redirectUris.includes(input.redirectUri)) {
    return {
      ok: false,
      redirectSafe: false,
      error: new OAuthError(
        "redirect_uri is not registered for this client",
        "invalid_request",
        400
      ),
    };
  }

  const fail = (message: string, code = "invalid_request") => ({
    ok: false as const,
    redirectSafe: true,
    error: new OAuthError(message, code),
  });

  if (input.responseType !== "code") {
    return fail("Only response_type=code is supported", "unsupported_response_type");
  }

  const scopes = parseScopeParam(input.scope);
  if (scopes === null) return fail("Requested scope is not supported", "invalid_scope");
  if (scopes.length === 0) scopes.push("read");

  if (!input.codeChallenge || input.codeChallenge.length < 20) {
    return fail("code_challenge is required (PKCE)");
  }
  if (input.codeChallengeMethod && input.codeChallengeMethod !== "S256") {
    return fail("Only code_challenge_method=S256 is supported");
  }

  return {
    ok: true,
    value: {
      client,
      redirectUri: input.redirectUri,
      scopes,
      state: input.state ?? null,
      codeChallenge: input.codeChallenge,
    },
  };
}

export async function issueAuthorizationCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string;
}): Promise<string> {
  const code = `ech_oac_${randomBytes(32).toString("base64url")}`;
  await createAuthorizationCodeRow({
    codeHash: hashAgentTokenSecret(code),
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    scopes: input.scopes,
    codeChallenge: input.codeChallenge,
    expiresAt: new Date(Date.now() + OAUTH_CODE_TTL_MS),
  });
  await writeAuditLog({
    actorUserId: input.userId,
    action: "oauth.code.issued",
    resourceType: "oauth-client",
    resourceId: input.clientId,
    metadata: { scopes: input.scopes },
  });
  return code;
}

// ─── Token endpoint ────────────────────────────────────────────────

export interface OAuthTokenGrant {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  scopes: string[];
}

async function rotateAgentTokenOrFail(agentTokenId: string) {
  const rotated = await rotateAgentTokenSecret({
    id: agentTokenId,
    expiresInDays: OAUTH_ACCESS_TOKEN_TTL_DAYS,
  });
  if (!rotated) throw new OAuthError("Token no longer exists", "invalid_grant", 400);
  return rotated;
}

async function issueGrant(input: {
  client: OAuthClient;
  userId: string;
  scopes: string[];
  agentTokenId?: string;
}): Promise<OAuthTokenGrant> {
  const { secret, token } = input.agentTokenId
    ? await rotateAgentTokenOrFail(input.agentTokenId)
    : await createAgentToken({
        name: input.client.clientName,
        scopes: input.scopes as ("read" | "write")[],
        createdByUserId: input.userId,
        expiresInDays: OAUTH_ACCESS_TOKEN_TTL_DAYS,
      });

  const refreshToken = `ech_rtk_${randomBytes(32).toString("base64url")}`;
  await createRefreshTokenRow({
    tokenHash: hashAgentTokenSecret(refreshToken),
    agentTokenId: token.id,
    clientId: input.client.id,
    expiresAt: new Date(Date.now() + OAUTH_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
  });

  await writeAuditLog({
    actorUserId: input.userId,
    action: input.agentTokenId ? "oauth.token.refreshed" : "oauth.token.issued",
    resourceType: "oauth-client",
    resourceId: input.client.id,
    metadata: { agentTokenId: token.id, scopes: input.scopes },
  });

  return {
    accessToken: secret,
    expiresIn: OAUTH_ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60,
    refreshToken,
    scopes: input.scopes,
  };
}

export async function exchangeAuthorizationCode(input: {
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<OAuthTokenGrant> {
  const client = await findOAuthClientById(input.clientId);
  if (!client) throw new OAuthError("Unknown client", "invalid_client", 401);

  const codeRow = await findUnconsumedAuthorizationCodeByHash(hashAgentTokenSecret(input.code));
  if (!codeRow)
    throw new OAuthError("Authorization code is invalid or expired", "invalid_grant", 400);
  if (codeRow.clientId !== client.id) {
    await consumeAuthorizationCodeRow(codeRow.id);
    throw new OAuthError("Authorization code was issued to another client", "invalid_grant", 400);
  }
  if (codeRow.redirectUri !== input.redirectUri) {
    await consumeAuthorizationCodeRow(codeRow.id);
    throw new OAuthError("redirect_uri does not match", "invalid_grant", 400);
  }
  if (pkceS256Challenge(input.codeVerifier) !== codeRow.codeChallenge) {
    await consumeAuthorizationCodeRow(codeRow.id);
    throw new OAuthError("PKCE verification failed", "invalid_grant", 400);
  }

  // Single use: consume before issuing so concurrent replays both fail
  await consumeAuthorizationCodeRow(codeRow.id);

  return issueGrant({
    client,
    userId: codeRow.userId,
    scopes: codeRow.scopes.filter((s): s is "read" | "write" => s === "read" || s === "write"),
  });
}

export async function refreshAccessToken(input: {
  clientId: string;
  refreshToken: string;
}): Promise<OAuthTokenGrant> {
  const client = await findOAuthClientById(input.clientId);
  if (!client) throw new OAuthError("Unknown client", "invalid_client", 401);

  const refreshRow = await findActiveRefreshTokenByHash(hashAgentTokenSecret(input.refreshToken));
  if (!refreshRow || refreshRow.clientId !== client.id) {
    throw new OAuthError("Refresh token is invalid or expired", "invalid_grant", 400);
  }

  const agentToken = await findAgentTokenById(refreshRow.agentTokenId);
  if (!agentToken || agentToken.revokedAt) {
    await revokeRefreshTokenRow(refreshRow.id);
    throw new OAuthError("The associated access token was revoked", "invalid_grant", 400);
  }

  // Rotation: the presented refresh token is invalidated even on later failure
  await revokeRefreshTokenRow(refreshRow.id);

  const scopes = agentToken.scopes.filter(
    (s): s is "read" | "write" => s === "read" || s === "write"
  );
  return issueGrant({
    client,
    userId: agentToken.createdByUserId ?? "",
    scopes,
    agentTokenId: agentToken.id,
  });
}
