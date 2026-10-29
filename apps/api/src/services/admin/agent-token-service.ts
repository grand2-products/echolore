import { createHash, randomBytes } from "node:crypto";
import { UserRole } from "@echolore/shared/contracts";
import type { AgentToken } from "../../db/schema.js";
import type { SessionUser } from "../../lib/auth.js";
import {
  createAgentTokenRow,
  findActiveAgentTokenByHash,
  listAgentTokenRows,
  revokeAgentTokenRow,
  touchAgentTokenLastUsed,
  updateAgentTokenSecret,
} from "../../repositories/admin/agent-token-repository.js";
import { getUserById } from "../../repositories/user/user-repository.js";

export const AGENT_TOKEN_PREFIX = "ech_agt_";
export const AGENT_TOKEN_SCOPES = ["read", "write"] as const;
export type AgentTokenScope = (typeof AGENT_TOKEN_SCOPES)[number];

export interface ResolvedAgentToken {
  token: AgentToken;
  /** The token acts with the read permissions of the admin who created it. */
  user: SessionUser;
}

export function generateAgentTokenSecret(): string {
  return AGENT_TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function hashAgentTokenSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export async function createAgentToken(input: {
  name: string;
  scopes: AgentTokenScope[];
  createdByUserId: string;
  /** Optional lifetime in days; absent means the token does not expire. */
  expiresInDays?: number | null;
}): Promise<{ token: AgentToken; secret: string }> {
  const secret = generateAgentTokenSecret();
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    : null;
  const token = await createAgentTokenRow({
    name: input.name,
    tokenHash: hashAgentTokenSecret(secret),
    scopes: input.scopes,
    createdByUserId: input.createdByUserId,
    expiresAt,
  });
  return { token, secret };
}

/** Replace an existing token's secret and extend its expiry (refresh rotation). */
export async function rotateAgentTokenSecret(input: {
  id: string;
  expiresInDays: number;
}): Promise<{ token: AgentToken; secret: string } | null> {
  const secret = generateAgentTokenSecret();
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
  const token = await updateAgentTokenSecret({
    id: input.id,
    tokenHash: hashAgentTokenSecret(secret),
    expiresAt,
  });
  return token ? { token, secret } : null;
}

export async function listAgentTokens(): Promise<AgentToken[]> {
  return listAgentTokenRows();
}

export async function revokeAgentToken(id: string): Promise<AgentToken | null> {
  return revokeAgentTokenRow(id);
}

/**
 * Resolve a bearer secret into an active token + the acting user.
 * Returns null for unknown, revoked, or expired tokens, or tokens whose creator
 * no longer has an active account.
 */
export async function resolveAgentToken(secret: string): Promise<ResolvedAgentToken | null> {
  if (!secret.startsWith(AGENT_TOKEN_PREFIX)) return null;

  const token = await findActiveAgentTokenByHash(hashAgentTokenSecret(secret));
  if (!token) return null;
  // At least one recognized scope; per-tool checks enforce the rest.
  const validScopes = token.scopes.filter((s) =>
    (AGENT_TOKEN_SCOPES as readonly string[]).includes(s)
  );
  if (validScopes.length === 0) return null;

  const dbUser = await getUserById(token.createdByUserId ?? "");
  if (!dbUser || dbUser.suspendedAt || dbUser.deletedAt) return null;

  // Fire-and-forget usage tracking — never blocks the request
  void touchAgentTokenLastUsed(token.id).catch(() => {});

  return {
    token,
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role === UserRole.Admin ? UserRole.Admin : UserRole.Member,
      avatarUrl: null,
    },
  };
}
