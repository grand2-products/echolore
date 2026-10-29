import { AGENT_TOKEN_SCOPE_VALUES, type AgentTokenScopeValue } from "@echolore/shared/contracts";
import { Hono } from "hono";
import { writeAuditLog } from "../lib/audit.js";
import type { SessionUser } from "../lib/auth.js";
import { parseCorsOrigins } from "../lib/cors-origins.js";
import { canReadPage } from "../policies/authorization-policy.js";
import { countAuditLogsByActionAndResourceId } from "../repositories/audit/audit-repository.js";
import { getPageBlocks, getPageById } from "../repositories/wiki/wiki-repository.js";
import { resolveAgentToken } from "../services/admin/agent-token-service.js";
import { pageBlocksToMarkdown } from "../services/wiki/block-markdown-exporter.js";
import { canAccessSpace, listVisibleSpaces } from "../services/wiki/space-service.js";
import { searchByVector } from "../services/wiki/vector-search-service.js";
import { createWikiArticleFromMarkdown } from "../services/wiki/wiki-article-creation-service.js";
import {
  auditWikiMaintenance,
  formatMaintenanceReportText,
} from "../services/wiki/wiki-maintenance-service.js";

/**
 * MCP (Model Context Protocol) endpoint for external AI agents.
 *
 * Implements protocol revision 2026-07-28 (stateless MCP: no initialize
 * handshake, per-request version metadata, required HTTP headers).
 *
 * Transport: stateless Streamable HTTP — single JSON-RPC message per POST,
 * plain JSON responses. Auth is a bearer agent token (admin-issued directly
 * or via the OAuth 2.1 flow). Read tools run with the page-read permissions
 * of the token's creator; page creation is attributed to the token's creator.
 *
 * Every tools/call is rate limited per token and recorded in the audit log
 * (action `mcp.tool.call`, resourceId = token id) for admin visibility.
 */

const SUPPORTED_PROTOCOL_VERSION = "2026-07-28";
const SUPPORTED_PROTOCOL_VERSIONS = [SUPPORTED_PROTOCOL_VERSION];
const SERVER_INFO = { name: "echolore", version: "0.1.0" };
const SERVER_INSTRUCTIONS =
  "EchoLore knowledge base: search and read wiki pages, list writable spaces, audit knowledge maintenance health, and save conversation content as new wiki articles when explicitly requested.";

/** Per-token tool call rate limit (counted via the audit log). */
const TOOL_CALL_RATE_LIMIT = { windowMs: 5 * 60_000, maxAttempts: 60 };
const TOOL_CALL_AUDIT_ACTION = "mcp.tool.call";

// CacheableResult freshness hints (spec: required on list/discover results)
const LIST_TTL_MS = 300_000; // 5 minutes
const LIST_CACHE_SCOPE = "private" as const; // tool set varies by token scopes

const JSON_RPC = {
  parseError: -32700,
  invalidRequest: -32600,
  invalidParams: -32602,
  methodNotFound: -32601,
  headerMismatch: -32020,
  unsupportedProtocolVersion: -32022,
} as const;

const META_PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_CLIENT_INFO = "io.modelcontextprotocol/clientInfo";
const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

interface JsonRpcRequest {
  jsonrpc: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface ToolOutput {
  text: string;
  /** Structured output; validated against the tool's outputSchema. */
  structured?: Record<string, unknown>;
}

interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** JSON Schema for the tool's structured output (omitted for text-only tools). */
  outputSchema?: Record<string, unknown>;
  /** Spec tool annotations describing safety characteristics. */
  annotations: Record<string, boolean>;
  requiredScopes: AgentTokenScopeValue[];
  handler: (args: Record<string, unknown>, user: SessionUser) => Promise<ToolOutput>;
}

function rpcResult(id: JsonRpcRequest["id"], result: Record<string, unknown>) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      resultType: "complete",
      ...result,
      _meta: { [META_SERVER_INFO]: SERVER_INFO },
    },
  };
}

function rpcError(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  data?: Record<string, unknown>
) {
  return {
    jsonrpc: "2.0",
    id,
    error: data ? { code, message, data } : { code, message },
  };
}

/** Decode the base64 sentinel format used for non-ASCII header values. */
function decodeHeaderValue(value: string): string {
  const match = /^=\?base64\?(.+)\?=$/s.exec(value);
  if (!match || match[1] === undefined) return value;
  return Buffer.from(match[1], "base64").toString("utf8");
}

// ─── Tool implementations (shared services, permission-checked) ───

const READ_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

class ToolArgumentError extends Error {}

function intArg(
  args: Record<string, unknown>,
  name: string,
  { min, max, fallback }: { min: number; max: number; fallback: number }
): number {
  const raw = args[name];
  if (raw === undefined || raw === null) return fallback;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ToolArgumentError(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

async function wikiSearch(args: Record<string, unknown>, user: SessionUser): Promise<ToolOutput> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) throw new ToolArgumentError("query is required");
  const limit = intArg(args, "limit", { min: 1, max: 10, fallback: 5 });

  // Over-fetch to compensate for permission filtering
  const results = await searchByVector(query, Math.min(limit * 2, 20));
  const accessible: Array<{
    pageId: string;
    title: string;
    similarity: number;
    snippet: string;
  }> = [];
  for (const r of results) {
    if (accessible.length >= limit) break;
    if (!(await canReadPage(user, r.pageId, ""))) continue;
    accessible.push({
      pageId: r.pageId,
      title: r.pageTitle,
      similarity: Math.round(r.similarity * 1000) / 1000,
      snippet: r.chunkText.slice(0, 300),
    });
  }

  const text =
    accessible.length > 0
      ? accessible
          .map(
            (r) =>
              `- [${r.title}] (id: ${r.pageId}, similarity: ${r.similarity})\n  Snippet: ${r.snippet}`
          )
          .join("\n")
      : "No accessible wiki pages found for that query.";

  return {
    text,
    structured: { query, results: accessible },
  };
}

const MAX_READ_LENGTH = 20_000;

async function wikiReadPage(args: Record<string, unknown>, user: SessionUser): Promise<ToolOutput> {
  const pageId = typeof args.pageId === "string" ? args.pageId.trim() : "";
  if (!pageId) throw new ToolArgumentError("pageId is required");
  const offset = intArg(args, "offset", { min: 0, max: 1_000_000, fallback: 0 });
  const maxLength = intArg(args, "maxLength", { min: 500, max: MAX_READ_LENGTH, fallback: 8_000 });

  const page = await getPageById(pageId);
  if (!page) return { text: "Page not found.", structured: { pageId, title: null, content: null } };
  if (!(await canReadPage(user, page.id, page.authorId))) {
    return { text: "You do not have permission to read this page." };
  }

  const blocks = await getPageBlocks(page.id);
  const full = `# ${page.title}\n\n${pageBlocksToMarkdown(blocks)}`;

  let content = offset > 0 ? full.slice(offset) : full;
  const truncated = content.length > maxLength;
  if (truncated) {
    // Cut on a line boundary when one is nearby so markdown stays well-formed
    let cut = content.lastIndexOf("\n", maxLength);
    if (cut < maxLength * 0.5) cut = maxLength;
    content = content.slice(0, cut);
  }
  const nextOffset = truncated ? offset + content.length : null;

  const text = truncated
    ? `${content}\n\n[truncated — call wiki_read_page again with offset=${nextOffset} for the rest]`
    : content;

  return {
    text,
    structured: {
      pageId: page.id,
      title: page.title,
      content: text,
      offset,
      truncated,
      nextOffset,
    },
  };
}

async function wikiListSpaces(
  _args: Record<string, unknown>,
  user: SessionUser
): Promise<ToolOutput> {
  const spaces = await listVisibleSpaces(user);
  const visible: Array<{ spaceId: string; name: string; type: string; canWrite: boolean }> = [];
  for (const space of spaces) {
    visible.push({
      spaceId: space.id,
      name: space.name,
      type: space.type,
      canWrite: await canAccessSpace(user, space, "write"),
    });
  }

  const text =
    visible.length > 0
      ? visible
          .map(
            (s) =>
              `- ${s.name} (id: ${s.spaceId}, type: ${s.type}${s.canWrite ? ", writable" : ""})`
          )
          .join("\n")
      : "No accessible spaces found.";

  return { text, structured: { spaces: visible } };
}

async function wikiMaintenanceReport(
  _args: Record<string, unknown>,
  user: SessionUser
): Promise<ToolOutput> {
  const report = await auditWikiMaintenance(user);
  return { text: await formatMaintenanceReportText(report) };
}

async function wikiCreatePage(
  args: Record<string, unknown>,
  user: SessionUser
): Promise<ToolOutput> {
  const title = typeof args.title === "string" ? args.title : "";
  const markdown = typeof args.markdown === "string" ? args.markdown : "";
  const spaceId = typeof args.spaceId === "string" ? args.spaceId : undefined;
  if (!title.trim()) throw new ToolArgumentError("title is required");
  if (!markdown.trim()) throw new ToolArgumentError("markdown is required");

  const page = await createWikiArticleFromMarkdown({ user, title, markdown, spaceId });
  return {
    text: `Created wiki page: ${page.title} (id: ${page.id})`,
    structured: { pageId: page.id, title: page.title, spaceId: page.spaceId },
  };
}

// Deterministic order (spec SHOULD) — clients rely on stable listing for caching
const MCP_TOOLS: McpToolDef[] = [
  {
    name: "wiki_search",
    description:
      "Search the internal wiki for pages matching a query using vector similarity. Returns page titles, IDs, and content snippets.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query to find relevant wiki pages" },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          description: "Maximum number of results to return (default 5)",
        },
      },
      required: ["query"],
    },
    outputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              pageId: { type: "string" },
              title: { type: "string" },
              similarity: { type: "number" },
              snippet: { type: "string" },
            },
            required: ["pageId", "title", "similarity", "snippet"],
          },
        },
      },
      required: ["query", "results"],
    },
    annotations: READ_ANNOTATIONS,
    requiredScopes: ["read"],
    handler: wikiSearch,
  },
  {
    name: "wiki_read_page",
    description:
      "Read the content of a wiki page by its ID as markdown (headings, lists, code blocks preserved). Use offset/maxLength to page through long pages.",
    inputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "The ID of the wiki page to read" },
        offset: {
          type: "integer",
          minimum: 0,
          description: "Character offset to start reading from (default 0)",
        },
        maxLength: {
          type: "integer",
          minimum: 500,
          maximum: MAX_READ_LENGTH,
          description: "Maximum characters to return per call (default 8000, max 20000)",
        },
      },
      required: ["pageId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string" },
        title: { type: ["string", "null"] },
        content: { type: ["string", "null"] },
        offset: { type: "integer" },
        truncated: { type: "boolean" },
        nextOffset: { type: ["integer", "null"] },
      },
      required: ["pageId", "title", "content", "offset", "truncated", "nextOffset"],
    },
    annotations: READ_ANNOTATIONS,
    requiredScopes: ["read"],
    handler: wikiReadPage,
  },
  {
    name: "wiki_list_spaces",
    description:
      "List the wiki spaces visible to you, with IDs and whether wiki_create_page may target them. Use this to pick a spaceId before creating a page.",
    inputSchema: { type: "object", additionalProperties: false },
    outputSchema: {
      type: "object",
      properties: {
        spaces: {
          type: "array",
          items: {
            type: "object",
            properties: {
              spaceId: { type: "string" },
              name: { type: "string" },
              type: { type: "string" },
              canWrite: { type: "boolean" },
            },
            required: ["spaceId", "name", "type", "canWrite"],
          },
        },
      },
      required: ["spaces"],
    },
    annotations: READ_ANNOTATIONS,
    requiredScopes: ["read"],
    handler: wikiListSpaces,
  },
  {
    name: "wiki_maintenance_report",
    description:
      "Audit the health of wiki knowledge and return a maintenance report: overdue or upcoming knowledge reviews, unapproved knowledge entries, registry drift (deleted but still registered), and stale or empty pages.",
    inputSchema: { type: "object", additionalProperties: false },
    annotations: READ_ANNOTATIONS,
    requiredScopes: ["read"],
    handler: wikiMaintenanceReport,
  },
  {
    name: "wiki_create_page",
    description:
      "Create a new wiki page from markdown content. Only use this when the user explicitly asks to save or share content as a wiki article. The page is created under the requesting user's name.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title for the new wiki page" },
        markdown: {
          type: "string",
          description: "Full article body in markdown (headings, lists, code blocks supported)",
        },
        spaceId: {
          type: "string",
          description: "Target space ID (see wiki_list_spaces; defaults to General)",
        },
      },
      required: ["title", "markdown"],
    },
    outputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string" },
        title: { type: "string" },
        spaceId: { type: "string" },
      },
      required: ["pageId", "title", "spaceId"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    requiredScopes: ["write"],
    handler: wikiCreatePage,
  },
];

// ─── Route ───────────────────────────────────────────────────────

export const mcpRoutes = new Hono();

mcpRoutes.all("/", async (c) => {
  if (c.req.method !== "POST") {
    return c.json(
      { error: { code: -32000, message: "Only POST is supported (stateless MCP server)" } },
      405
    );
  }

  // Origin validation (spec MUST — DNS rebinding defense). Requests without an
  // Origin header (native/server-side MCP clients) are allowed; cross-site
  // browser origins must match the configured CORS allowlist.
  const origin = c.req.header("origin");
  if (origin && !parseCorsOrigins().has(origin)) {
    return c.json({ error: { code: -32000, message: "Origin not allowed" } }, 403);
  }

  // Bearer agent-token auth — the token acts as its creating admin.
  const authorization = c.req.header("authorization") ?? "";
  const [scheme, secret] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !secret) {
    return c.json({ error: { code: -32000, message: "Missing bearer token" } }, 401);
  }

  const resolved = await resolveAgentToken(secret.trim());
  if (!resolved) {
    return c.json({ error: { code: -32000, message: "Invalid, expired, or revoked token" } }, 401);
  }

  const scopes = (resolved.token.scopes ?? []).filter((s): s is AgentTokenScopeValue =>
    (AGENT_TOKEN_SCOPE_VALUES as readonly string[]).includes(s)
  );

  let message: JsonRpcRequest;
  try {
    const parsed = await c.req.json();
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      typeof parsed.method !== "string"
    ) {
      return c.json(rpcError(null, JSON_RPC.invalidRequest, "Invalid Request"), 400);
    }
    message = parsed as JsonRpcRequest;
  } catch {
    return c.json(rpcError(null, JSON_RPC.parseError, "Parse error"), 400);
  }

  // ─── Header / version validation (Streamable HTTP 2026-07-28) ───

  const id = message.id ?? null;

  // Notifications (no id) that pass validation get 202 with no body
  const isNotification = message.id === undefined || message.id === null;

  const headerVersion = c.req.header("mcp-protocol-version")?.trim() ?? "";
  const meta = (message.params?._meta ?? {}) as Record<string, unknown>;
  const metaVersion =
    typeof meta[META_PROTOCOL_VERSION] === "string" ? (meta[META_PROTOCOL_VERSION] as string) : "";

  const headerMethod = c.req.header("mcp-method")?.trim() ?? "";
  const headerName = decodeHeaderValue(c.req.header("mcp-name")?.trim() ?? "");

  // MCP-Protocol-Version is required and must match the body _meta value.
  // (This server does not support pre-header clients, so a missing header is
  // rejected per spec Server Validation rules.)
  if (!headerVersion || !metaVersion || headerVersion !== metaVersion) {
    return c.json(
      rpcError(
        id,
        JSON_RPC.headerMismatch,
        "Missing or mismatched MCP-Protocol-Version header (must match params._meta protocolVersion)"
      ),
      400
    );
  }

  if (headerVersion !== SUPPORTED_PROTOCOL_VERSION) {
    return c.json(
      rpcError(
        id,
        JSON_RPC.unsupportedProtocolVersion,
        `Unsupported protocol version: ${headerVersion}`,
        { supportedVersions: SUPPORTED_PROTOCOL_VERSIONS }
      ),
      400
    );
  }

  // Mcp-Method is required and must match the body method.
  if (!headerMethod || headerMethod !== message.method) {
    return c.json(
      rpcError(id, JSON_RPC.headerMismatch, "Missing or mismatched Mcp-Method header"),
      400
    );
  }

  // Mcp-Name is required for tools/call and must match params.name.
  if (message.method === "tools/call") {
    const bodyName = typeof message.params?.name === "string" ? message.params.name : "";
    if (!headerName || !bodyName || headerName !== bodyName) {
      return c.json(
        rpcError(id, JSON_RPC.headerMismatch, "Missing or mismatched Mcp-Name header"),
        400
      );
    }
  }

  const clientInfo = meta[META_CLIENT_INFO];
  const clientName =
    clientInfo && typeof clientInfo === "object" && "name" in clientInfo
      ? String((clientInfo as { name: unknown }).name)
      : null;

  // ─── Method dispatch ────────────────────────────────────────────

  switch (message.method) {
    case "server/discover": {
      if (isNotification) return c.body(null, 202);
      return c.json(
        rpcResult(id, {
          supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
          capabilities: { tools: {} },
          instructions: SERVER_INSTRUCTIONS,
          ttlMs: LIST_TTL_MS,
          cacheScope: LIST_CACHE_SCOPE,
        })
      );
    }

    case "tools/list": {
      if (isNotification) return c.body(null, 202);
      // Tool set is filtered by the token's scopes (per-request credentials),
      // deterministic order for client-side caching.
      const tools = MCP_TOOLS.filter((t) => t.requiredScopes.every((s) => scopes.includes(s))).map(
        (t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
          annotations: t.annotations,
        })
      );
      return c.json(rpcResult(id, { tools, ttlMs: LIST_TTL_MS, cacheScope: LIST_CACHE_SCOPE }));
    }

    case "tools/call": {
      if (isNotification) return c.body(null, 202);
      const name = message.params?.name;
      const args =
        message.params?.arguments && typeof message.params.arguments === "object"
          ? (message.params.arguments as Record<string, unknown>)
          : {};
      const tool = MCP_TOOLS.find((t) => t.name === name);

      // Unknown tool is a protocol error (spec: tools.md Error Handling)
      if (!tool) {
        return c.json(rpcError(id, JSON_RPC.invalidParams, `Unknown tool: ${name}`));
      }

      const missingScope = tool.requiredScopes.find((s) => !scopes.includes(s));
      if (missingScope) {
        return c.json(
          rpcResult(id, {
            content: [
              {
                type: "text",
                text: `This token does not have the '${missingScope}' scope required for this tool.`,
              },
            ],
            isError: true,
          })
        );
      }

      // ─── Per-token rate limit (audit-log based, same as auth routes) ───
      const since = new Date(Date.now() - TOOL_CALL_RATE_LIMIT.windowMs);
      let recentCalls = 0;
      try {
        recentCalls = await countAuditLogsByActionAndResourceId(
          TOOL_CALL_AUDIT_ACTION,
          resolved.token.id,
          since
        );
      } catch {
        // Counting is best-effort; never block on audit infrastructure failure
      }
      if (recentCalls >= TOOL_CALL_RATE_LIMIT.maxAttempts) {
        return c.json(
          rpcError(
            id,
            -32000,
            `Rate limit exceeded: more than ${TOOL_CALL_RATE_LIMIT.maxAttempts} tool calls in the last ${Math.round(
              TOOL_CALL_RATE_LIMIT.windowMs / 60_000
            )} minutes for this token`,
            { retryAfterMs: TOOL_CALL_RATE_LIMIT.windowMs }
          ),
          429
        );
      }

      const startedAt = Date.now();
      const clientIp = c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? null;
      const recordCall = (ok: boolean, error?: string) => {
        console.log(
          JSON.stringify({
            event: TOOL_CALL_AUDIT_ACTION,
            tool: tool.name,
            userId: resolved.user.id,
            client: clientName,
            ok,
            durationMs: Date.now() - startedAt,
            ...(error ? { error } : {}),
          })
        );
        // Durable per-token audit trail surfaced in the admin UI
        return writeAuditLog({
          actorUserId: resolved.user.id,
          actorEmail: resolved.user.email,
          action: TOOL_CALL_AUDIT_ACTION,
          resourceType: "agent-token",
          resourceId: resolved.token.id,
          metadata: { tool: tool.name, ok, durationMs: Date.now() - startedAt, client: clientName },
          ipAddress: clientIp,
          userAgent: c.req.header("user-agent") ?? null,
        });
      };

      try {
        const output = await tool.handler(args, resolved.user);
        await recordCall(true);
        return c.json(
          rpcResult(id, {
            content: [{ type: "text", text: output.text }],
            ...(output.structured ? { structuredContent: output.structured } : {}),
          })
        );
      } catch (error) {
        // Input validation errors are tool execution errors (SEP-1303) so the
        // model can self-correct; anything else is reported as an internal
        // tool error without leaking details.
        const isArgError = error instanceof ToolArgumentError;
        await recordCall(false, error instanceof Error ? error.message : "Unknown");
        if (isArgError) {
          return c.json(
            rpcResult(id, {
              content: [
                {
                  type: "text",
                  text: `Invalid arguments: ${error instanceof Error ? error.message : "unknown"}`,
                },
              ],
              isError: true,
            })
          );
        }
        return c.json(
          rpcResult(id, {
            content: [{ type: "text", text: "Internal error while executing the tool." }],
            isError: true,
          })
        );
      }
    }

    default: {
      // This server implements only 2026-07-28 (no legacy initialize/ping).
      // Unimplemented methods return 404 + -32601 per the transport spec.
      if (isNotification) return c.body(null, 202);
      return c.json(
        rpcError(id, JSON_RPC.methodNotFound, `Method not found: ${message.method}`),
        404
      );
    }
  }
});
