import type { AgentTokenScopeValue } from "@echolore/shared/contracts";
import { Hono } from "hono";
import type { SessionUser } from "../lib/auth.js";
import { stripHtml } from "../lib/html-utils.js";
import { canReadPage } from "../policies/authorization-policy.js";
import { getPageBlocks, getPageById } from "../repositories/wiki/wiki-repository.js";
import { resolveAgentToken } from "../services/admin/agent-token-service.js";
import { searchByVector } from "../services/wiki/vector-search-service.js";
import {
  auditWikiMaintenance,
  formatMaintenanceReportText,
} from "../services/wiki/wiki-maintenance-service.js";

/**
 * MCP (Model Context Protocol) endpoint for external AI agents.
 *
 * Stateless Streamable HTTP: single JSON-RPC message per POST, plain JSON
 * responses. Auth is a bearer agent token (admin-issued, read scope).
 * Tools run with the page-read permissions of the token's creator.
 */

const SUPPORTED_PROTOCOL_VERSIONS = new Set(["2024-11-05", "2025-03-26", "2025-06-18"]);
const LATEST_PROTOCOL_VERSION = "2025-06-18";
const SERVER_NAME = "echolore";

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
  handler: (args: Record<string, unknown>, user: SessionUser) => Promise<string>;
}

function textResult(text: string) {
  return { content: [{ type: "text", text }] };
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

class ToolArgumentError extends Error {}

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
    handler: wikiReadPage,
  },
  {
    name: "wiki_maintenance_report",
    description:
      "Audit the health of wiki knowledge and return a maintenance report: overdue or upcoming knowledge reviews, unapproved knowledge entries, registry drift (deleted but still registered), and stale or empty pages.",
    inputSchema: { type: "object", properties: {} },
    handler: wikiMaintenanceReport,
  },
];

// ─── JSON-RPC handling ───────────────────────────────────────────

function jsonRpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleRpcMessage(
  message: JsonRpcRequest,
  user: SessionUser,
  scopes: AgentTokenScopeValue[]
): Promise<{ status: number; body: unknown } | null> {
  // Notifications (no id) get no response body
  if (message.id === undefined || message.id === null) return null;

  switch (message.method) {
    case "initialize": {
      const requested =
        typeof message.params?.protocolVersion === "string"
          ? message.params.protocolVersion
          : LATEST_PROTOCOL_VERSION;
      return {
        status: 200,
        body: jsonRpcResult(message.id, {
          protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.has(requested)
            ? requested
            : LATEST_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: "0.1.0" },
        }),
      };
    }

    case "ping":
      return { status: 200, body: jsonRpcResult(message.id, {}) };

    case "tools/list":
      return {
        status: 200,
        body: jsonRpcResult(message.id, {
          tools: MCP_TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        }),
      };

    case "tools/call": {
      const name = message.params?.name;
      const args =
        message.params?.arguments && typeof message.params.arguments === "object"
          ? (message.params.arguments as Record<string, unknown>)
          : {};
      const tool = MCP_TOOLS.find((t) => t.name === name);

      if (!tool) {
        return { status: 200, body: jsonRpcError(message.id, -32602, `Unknown tool: ${name}`) };
      }
      if (!scopes.includes("read")) {
        return {
          status: 200,
          body: jsonRpcResult(message.id, {
            ...textResult("This token does not have the read scope required for this tool."),
            isError: true,
          }),
        };
      }

      const startedAt = Date.now();
      try {
        const text = await tool.handler(args, user);
        console.log(
          JSON.stringify({
            event: "mcp.tool.call",
            tool: tool.name,
            userId: user.id,
            ok: true,
            durationMs: Date.now() - startedAt,
          })
        );
        return { status: 200, body: jsonRpcResult(message.id, textResult(text)) };
      } catch (error) {
        const isArgError = error instanceof ToolArgumentError;
        console.log(
          JSON.stringify({
            event: "mcp.tool.call",
            tool: tool.name,
            userId: user.id,
            ok: false,
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : "Unknown",
          })
        );
        if (isArgError) {
          return {
            status: 200,
            body: jsonRpcError(
              message.id,
              -32602,
              error instanceof Error ? error.message : "Invalid arguments"
            ),
          };
        }
        return {
          status: 200,
          body: jsonRpcResult(message.id, {
            ...textResult("Internal error while executing the tool."),
            isError: true,
          }),
        };
      }
    }

    default:
      return {
        status: 200,
        body: jsonRpcError(message.id, -32601, `Method not found: ${message.method}`),
      };
  }
}

// ─── Route ───────────────────────────────────────────────────────

export const mcpRoutes = new Hono();

mcpRoutes.all("/", async (c) => {
  if (c.req.method !== "POST") {
    return c.json(
      { error: { code: -32000, message: "Only POST is supported (stateless MCP server)" } },
      405
    );
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

  let message: JsonRpcRequest;
  try {
    const parsed = await c.req.json();
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      typeof parsed.method !== "string"
    ) {
      return c.json({ error: { code: -32600, message: "Invalid Request" } }, 400);
    }
    message = parsed as JsonRpcRequest;
  } catch {
    return c.json({ error: { code: -32700, message: "Parse error" } }, 400);
  }

  const scopes = (resolved.token.scopes ?? []).filter((s): s is AgentTokenScopeValue =>
    (["read"] as const).includes(s as AgentTokenScopeValue)
  );

  const response = await handleRpcMessage(message, resolved.user, scopes);
  if (!response) return c.body(null, 202);
  return c.json(response.body, response.status as 200 | 400);
});
