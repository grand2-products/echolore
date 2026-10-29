import { AGENT_TOKEN_SCOPE_VALUES, type AgentTokenScopeValue } from "@echolore/shared/contracts";
import { Hono } from "hono";
import type { SessionUser } from "../lib/auth.js";
import { parseCorsOrigins } from "../lib/cors-origins.js";
import { stripHtml } from "../lib/html-utils.js";
import { canReadPage } from "../policies/authorization-policy.js";
import { getPageBlocks, getPageById } from "../repositories/wiki/wiki-repository.js";
import { resolveAgentToken } from "../services/admin/agent-token-service.js";
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
 * plain JSON responses. Auth is a bearer agent token (admin-issued).
 * Read tools run with the page-read permissions of the token's creator;
 * page creation is attributed to the token's creator.
 */

const SUPPORTED_PROTOCOL_VERSION = "2026-07-28";
const SUPPORTED_PROTOCOL_VERSIONS = [SUPPORTED_PROTOCOL_VERSION];
const SERVER_INFO = { name: "echolore", version: "0.1.0" };
const SERVER_INSTRUCTIONS =
  "EchoLore knowledge base: search and read wiki pages, audit knowledge maintenance health, and save conversation content as new wiki articles when explicitly requested.";

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

interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredScopes: AgentTokenScopeValue[];
  handler: (args: Record<string, unknown>, user: SessionUser) => Promise<string>;
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

async function wikiSearch(args: Record<string, unknown>, user: SessionUser): Promise<string> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) throw new ToolArgumentError("query is required");

  const results = await searchByVector(query, 10);
  const output: string[] = [];
  for (const r of results.slice(0, 5)) {
    const canRead = await canReadPage(user, r.pageId, "");
    if (!canRead) continue;
    output.push(
      `- [${r.pageTitle}] (id: ${r.pageId}, similarity: ${r.similarity.toFixed(3)})\n  Snippet: ${r.chunkText.slice(0, 200)}`
    );
  }
  return output.length > 0 ? output.join("\n") : "No accessible wiki pages found for that query.";
}

async function wikiReadPage(args: Record<string, unknown>, user: SessionUser): Promise<string> {
  const pageId = typeof args.pageId === "string" ? args.pageId.trim() : "";
  if (!pageId) throw new ToolArgumentError("pageId is required");

  const page = await getPageById(pageId);
  if (!page) return "Page not found.";
  if (!(await canReadPage(user, page.id, page.authorId))) {
    return "You do not have permission to read this page.";
  }

  const blocks = await getPageBlocks(page.id);
  const content = blocks
    .map((b) => (b.content ? stripHtml(b.content) : ""))
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
  return `# ${page.title}\n\n${content}`;
}

async function wikiMaintenanceReport(_args: Record<string, unknown>, user: SessionUser) {
  const report = await auditWikiMaintenance(user);
  return formatMaintenanceReportText(report);
}

async function wikiCreatePage(args: Record<string, unknown>, user: SessionUser): Promise<string> {
  const title = typeof args.title === "string" ? args.title : "";
  const markdown = typeof args.markdown === "string" ? args.markdown : "";
  const spaceId = typeof args.spaceId === "string" ? args.spaceId : undefined;
  if (!title.trim()) throw new ToolArgumentError("title is required");
  if (!markdown.trim()) throw new ToolArgumentError("markdown is required");

  const page = await createWikiArticleFromMarkdown({ user, title, markdown, spaceId });
  return `Created wiki page: ${page.title} (id: ${page.id})`;
}

class ToolArgumentError extends Error {}

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
      },
      required: ["query"],
    },
    requiredScopes: ["read"],
    handler: wikiSearch,
  },
  {
    name: "wiki_read_page",
    description:
      "Read the full content of a wiki page by its ID. Use this when you need more detail than the search snippet provides.",
    inputSchema: {
      type: "object",
      properties: {
        pageId: { type: "string", description: "The ID of the wiki page to read" },
      },
      required: ["pageId"],
    },
    requiredScopes: ["read"],
    handler: wikiReadPage,
  },
  {
    name: "wiki_maintenance_report",
    description:
      "Audit the health of wiki knowledge and return a maintenance report: overdue or upcoming knowledge reviews, unapproved knowledge entries, registry drift (deleted but still registered), and stale or empty pages.",
    inputSchema: { type: "object", additionalProperties: false },
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
        spaceId: { type: "string", description: "Target space ID (defaults to General)" },
      },
      required: ["title", "markdown"],
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
    return c.json({ error: { code: -32000, message: "Invalid or revoked token" } }, 401);
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

      const startedAt = Date.now();
      const log = (ok: boolean, error?: string) =>
        console.log(
          JSON.stringify({
            event: "mcp.tool.call",
            tool: tool.name,
            userId: resolved.user.id,
            client: clientName,
            ok,
            durationMs: Date.now() - startedAt,
            ...(error ? { error } : {}),
          })
        );

      try {
        const text = await tool.handler(args, resolved.user);
        log(true);
        return c.json(rpcResult(id, { content: [{ type: "text", text }] }));
      } catch (error) {
        // Input validation errors are tool execution errors (SEP-1303) so the
        // model can self-correct; anything else is reported as an internal
        // tool error without leaking details.
        const isArgError = error instanceof ToolArgumentError;
        log(false, error instanceof Error ? error.message : "Unknown");
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
