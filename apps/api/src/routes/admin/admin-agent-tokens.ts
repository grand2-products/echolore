import {
  AGENT_TOKEN_SCOPE_VALUES,
  type AgentTokenDto,
  type AgentTokenUsageDto,
} from "@echolore/shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { AgentToken } from "../../db/schema.js";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { listAuditLogsByActionAndResourceId } from "../../repositories/audit/audit-repository.js";
import {
  createAgentToken,
  listAgentTokens,
  revokeAgentToken,
} from "../../services/admin/agent-token-service.js";
import { createAgentTokenSchema } from "./schemas.js";

const TOOL_CALL_AUDIT_ACTION = "mcp.tool.call";
const USAGE_HISTORY_LIMIT = 50;

function toAgentTokenDto(token: AgentToken): AgentTokenDto {
  return {
    id: token.id,
    name: token.name,
    scopes: token.scopes.filter((s): s is AgentTokenDto["scopes"][number] =>
      (AGENT_TOKEN_SCOPE_VALUES as readonly string[]).includes(s)
    ),
    createdByUserId: token.createdByUserId,
    lastUsedAt: token.lastUsedAt ? token.lastUsedAt.toISOString() : null,
    revokedAt: token.revokedAt ? token.revokedAt.toISOString() : null,
    expiresAt: token.expiresAt ? token.expiresAt.toISOString() : null,
    createdAt: token.createdAt.toISOString(),
  };
}

export const adminAgentTokenRoutes = new Hono<AppEnv>();

adminAgentTokenRoutes.get(
  "/agent-tokens",
  withErrorHandler("ADMIN_AGENT_TOKENS_LIST_FAILED", "Failed to list agent tokens"),
  async (c) => {
    const tokens = await listAgentTokens();
    return c.json({ tokens: tokens.map(toAgentTokenDto) });
  }
);

adminAgentTokenRoutes.post(
  "/agent-tokens",
  zValidator("json", createAgentTokenSchema),
  withErrorHandler("ADMIN_AGENT_TOKEN_CREATE_FAILED", "Failed to create agent token"),
  async (c) => {
    const data = c.req.valid("json");
    const user = c.get("user");

    const { token, secret } = await createAgentToken({
      name: data.name,
      scopes: data.scopes,
      createdByUserId: user.id,
      expiresInDays: data.expiresInDays ?? null,
    });
    // The plaintext secret is returned exactly once — only its hash is stored.
    return c.json({ token: toAgentTokenDto(token), secret }, 201);
  }
);

adminAgentTokenRoutes.delete(
  "/agent-tokens/:id",
  withErrorHandler("ADMIN_AGENT_TOKEN_REVOKE_FAILED", "Failed to revoke agent token"),
  async (c) => {
    const { id } = c.req.param();
    const token = await revokeAgentToken(id);
    if (!token) return jsonError(c, 404, "AGENT_TOKEN_NOT_FOUND", "Agent token not found");
    return c.json({ token: toAgentTokenDto(token) });
  }
);

adminAgentTokenRoutes.get(
  "/agent-tokens/:id/usage",
  withErrorHandler("ADMIN_AGENT_TOKEN_USAGE_FAILED", "Failed to load agent token usage"),
  async (c) => {
    const { id } = c.req.param();
    const logs = await listAuditLogsByActionAndResourceId(
      TOOL_CALL_AUDIT_ACTION,
      id,
      USAGE_HISTORY_LIMIT
    );
    const usage: AgentTokenUsageDto[] = logs.map((log) => ({
      id: log.id,
      tool: typeof log.metadata?.tool === "string" ? log.metadata.tool : "unknown",
      ok: log.metadata?.ok === true,
      client: typeof log.metadata?.client === "string" ? log.metadata.client : null,
      createdAt: log.createdAt.toISOString(),
    }));
    return c.json({ usage });
  }
);
