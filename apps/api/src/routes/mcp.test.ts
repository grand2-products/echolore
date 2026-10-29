import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentToken } from "../db/schema.js";
import type { SessionUser } from "../lib/auth.js";
import { adminUser } from "../test-utils/index.js";
import { mcpRoutes } from "./mcp.js";

const {
  resolveAgentTokenMock,
  searchByVectorMock,
  getPageByIdMock,
  getPageBlocksMock,
  auditWikiMaintenanceMock,
  createWikiArticleFromMarkdownMock,
  listVisibleSpacesMock,
  canAccessSpaceMock,
  countToolCallsMock,
  writeAuditLogMock,
} = vi.hoisted(() => ({
  resolveAgentTokenMock: vi.fn(),
  searchByVectorMock: vi.fn(),
  getPageByIdMock: vi.fn(),
  getPageBlocksMock: vi.fn(),
  auditWikiMaintenanceMock: vi.fn(),
  createWikiArticleFromMarkdownMock: vi.fn(),
  listVisibleSpacesMock: vi.fn(),
  canAccessSpaceMock: vi.fn(),
  countToolCallsMock: vi.fn(),
  writeAuditLogMock: vi.fn(),
}));

vi.mock("../services/admin/agent-token-service.js", () => ({
  resolveAgentToken: resolveAgentTokenMock,
}));

vi.mock("../services/wiki/vector-search-service.js", () => ({
  searchByVector: searchByVectorMock,
}));

vi.mock("../repositories/wiki/wiki-repository.js", () => ({
  getPageById: getPageByIdMock,
  getPageBlocks: getPageBlocksMock,
}));

vi.mock("../policies/authorization-policy.js", () => ({
  canReadPage: vi.fn(async () => true),
}));

vi.mock("../services/wiki/wiki-maintenance-service.js", () => ({
  auditWikiMaintenance: auditWikiMaintenanceMock,
  formatMaintenanceReportText: vi.fn(
    async () => "Scanned 3 page(s).\n- [Review overdue] Old page (id: p1) — Review is overdue"
  ),
}));

vi.mock("../services/wiki/wiki-article-creation-service.js", () => ({
  createWikiArticleFromMarkdown: createWikiArticleFromMarkdownMock,
}));

vi.mock("../services/wiki/space-service.js", () => ({
  listVisibleSpaces: listVisibleSpacesMock,
  canAccessSpace: canAccessSpaceMock,
}));

vi.mock("../repositories/audit/audit-repository.js", () => ({
  countAuditLogsByActionAndResourceId: countToolCallsMock,
}));

vi.mock("../lib/audit.js", () => ({
  writeAuditLog: writeAuditLogMock,
}));

vi.mock("../lib/cors-origins.js", () => ({
  parseCorsOrigins: vi.fn(() => new Set(["https://wiki.example.com"])),
}));

function tokenRow(overrides: Partial<AgentToken> = {}): AgentToken {
  const now = new Date();
  return {
    id: "agt_1",
    name: "Test token",
    tokenHash: "hash",
    scopes: ["read"],
    createdByUserId: "admin_1",
    lastUsedAt: null,
    revokedAt: null,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as AgentToken;
}

const PROTOCOL_VERSION = "2026-07-28";

interface PostOptions {
  token?: string | null;
  method?: string;
  name?: string | null;
  metaVersion?: string | null;
  origin?: string;
}

function meta(metaVersion: string | null) {
  return metaVersion === null ? {} : { "io.modelcontextprotocol/protocolVersion": metaVersion };
}

function post(
  body: Record<string, unknown>,
  {
    token = "ech_agt_valid",
    method,
    name,
    metaVersion = PROTOCOL_VERSION,
    origin,
  }: PostOptions = {}
) {
  const rpcMethod = method ?? (body.method as string);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "mcp-method": rpcMethod,
  };
  if (metaVersion !== null) headers["mcp-protocol-version"] = metaVersion;
  if (name !== null && name !== undefined) headers["mcp-name"] = name;
  if (token) headers.authorization = `Bearer ${token}`;
  if (origin) headers.origin = origin;

  const bodyParams = (body.params ?? {}) as Record<string, unknown>;
  const params = { ...bodyParams, _meta: meta(metaVersion) };

  return mcpRoutes.request("/", {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      ...body,
      params,
    }),
  });
}

function callTool(
  id: number | string,
  name: string,
  args: Record<string, unknown>,
  options: PostOptions = {}
) {
  return post(
    { id, method: "tools/call", params: { name, arguments: args } },
    { name, ...options }
  );
}

describe("mcpRoutes (protocol 2026-07-28)", () => {
  beforeEach(() => {
    resolveAgentTokenMock.mockReset();
    searchByVectorMock.mockReset();
    getPageByIdMock.mockReset();
    getPageBlocksMock.mockReset();
    auditWikiMaintenanceMock.mockReset();
    createWikiArticleFromMarkdownMock.mockReset();
    listVisibleSpacesMock.mockReset();
    canAccessSpaceMock.mockReset();
    countToolCallsMock.mockReset();
    writeAuditLogMock.mockReset();
    resolveAgentTokenMock.mockResolvedValue({
      token: tokenRow(),
      user: adminUser() as SessionUser,
    });
    countToolCallsMock.mockResolvedValue(0);
    writeAuditLogMock.mockResolvedValue(undefined);
    listVisibleSpacesMock.mockResolvedValue([]);
  });

  // ─── Transport & security ─────────────────────────────────────

  it("rejects requests without a bearer token", async () => {
    const res = await post({ id: 1, method: "server/discover" }, { token: null });
    expect(res.status).toBe(401);
  });

  it("rejects invalid or revoked tokens", async () => {
    resolveAgentTokenMock.mockResolvedValue(null);
    const res = await post({ id: 1, method: "server/discover" });
    expect(res.status).toBe(401);
  });

  it("rejects non-POST methods", async () => {
    const res = await mcpRoutes.request("/", { method: "GET" });
    expect(res.status).toBe(405);
  });

  it("rejects cross-site origins not in the allowlist", async () => {
    const res = await post(
      { id: 1, method: "server/discover" },
      {
        origin: "https://evil.example.com",
      }
    );
    expect(res.status).toBe(403);
  });

  it("allows allowlisted origins", async () => {
    const res = await post(
      { id: 1, method: "server/discover" },
      {
        origin: "https://wiki.example.com",
      }
    );
    expect(res.status).toBe(200);
  });

  it("rejects malformed JSON with a parse error", async () => {
    const res = await mcpRoutes.request("/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer ech_agt_valid",
        "mcp-protocol-version": PROTOCOL_VERSION,
        "mcp-method": "server/discover",
      },
      body: "not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(-32700);
  });

  // ─── Header & version validation ──────────────────────────────

  it("rejects a missing MCP-Protocol-Version header", async () => {
    const res = await post({ id: 1, method: "server/discover" }, { metaVersion: null });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(-32020);
  });

  it("rejects when the header version does not match the body _meta version", async () => {
    const res = await post(
      { id: 1, method: "server/discover" },
      { metaVersion: "2026-07-29" } // header value; body _meta will carry the same
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    // Both carry the same (unsupported) version → unsupported-version error
    expect(body.error.code).toBe(-32022);
    expect(body.error.data.supportedVersions).toEqual([PROTOCOL_VERSION]);
  });

  it("rejects header/_meta version mismatch with HeaderMismatch", async () => {
    const res = await mcpRoutes.request("/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer ech_agt_valid",
        "mcp-protocol-version": PROTOCOL_VERSION,
        "mcp-method": "server/discover",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "server/discover",
        params: { _meta: meta("2025-06-18") },
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(-32020);
  });

  it("rejects a mismatched Mcp-Method header", async () => {
    const res = await post({ id: 1, method: "server/discover" }, { method: "tools/list" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(-32020);
  });

  it("rejects tools/call with a mismatched Mcp-Name header", async () => {
    const res = await callTool(1, "wiki_search", { query: "x" }, { name: "wiki_read_page" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(-32020);
  });

  // ─── server/discover ──────────────────────────────────────────

  it("answers server/discover with versions, capabilities, and serverInfo", async () => {
    const res = await post({ id: 1, method: "server/discover" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.resultType).toBe("complete");
    expect(body.result.supportedVersions).toEqual([PROTOCOL_VERSION]);
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result._meta["io.modelcontextprotocol/serverInfo"].name).toBe("echolore");
    expect(body.result.ttlMs).toBeGreaterThan(0);
    expect(body.result.cacheScope).toBe("private");
    expect(typeof body.result.instructions).toBe("string");
  });

  // ─── Tools ────────────────────────────────────────────────────

  it("lists tools filtered by token scope in deterministic order", async () => {
    resolveAgentTokenMock.mockResolvedValue({
      token: tokenRow({ scopes: ["read"] }),
      user: adminUser(),
    });
    const res = await post({ id: 2, method: "tools/list" });
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name);
    // write-scoped tool hidden from read-only tokens
    expect(names).toEqual([
      "wiki_search",
      "wiki_read_page",
      "wiki_list_spaces",
      "wiki_maintenance_report",
    ]);
    expect(body.result.ttlMs).toBeGreaterThan(0);
    expect(body.result.cacheScope).toBe("private");
  });

  it("exposes outputSchema and annotations on listed tools", async () => {
    resolveAgentTokenMock.mockResolvedValue({
      token: tokenRow({ scopes: ["read", "write"] }),
      user: adminUser(),
    });
    const res = await post({ id: 2, method: "tools/list" });
    const body = await res.json();
    const search = body.result.tools.find((t: { name: string }) => t.name === "wiki_search");
    expect(search.outputSchema.properties.results).toBeDefined();
    expect(search.annotations.readOnlyHint).toBe(true);
    const create = body.result.tools.find((t: { name: string }) => t.name === "wiki_create_page");
    expect(create.outputSchema.properties.pageId).toBeDefined();
    expect(create.annotations.readOnlyHint).toBe(false);
  });

  it("lists all five tools for a write-scoped token", async () => {
    resolveAgentTokenMock.mockResolvedValue({
      token: tokenRow({ scopes: ["read", "write"] }),
      user: adminUser(),
    });
    const res = await post({ id: 2, method: "tools/list" });
    const body = await res.json();
    expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual([
      "wiki_search",
      "wiki_read_page",
      "wiki_list_spaces",
      "wiki_maintenance_report",
      "wiki_create_page",
    ]);
  });

  it("executes tools/call for the maintenance report", async () => {
    auditWikiMaintenanceMock.mockResolvedValue({ findings: [], summary: {} });
    const res = await callTool(3, "wiki_maintenance_report", {});
    const body = await res.json();
    expect(body.result.resultType).toBe("complete");
    expect(body.result.content[0].type).toBe("text");
    expect(body.result.content[0].text).toContain("Review overdue");
    expect(auditWikiMaintenanceMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "admin_1" })
    );
  });

  it("executes tools/call for wiki_search with structured output", async () => {
    searchByVectorMock.mockResolvedValue([
      { pageId: "p1", pageTitle: "Page one", chunkText: "content here", similarity: 0.9 },
    ]);
    const res = await callTool(4, "wiki_search", { query: "topic" });
    const body = await res.json();
    expect(body.result.content[0].text).toContain("Page one");
    expect(body.result.structuredContent.results[0]).toMatchObject({
      pageId: "p1",
      title: "Page one",
      similarity: 0.9,
    });
    expect(searchByVectorMock).toHaveBeenCalledWith("topic", 10);
  });

  it("honors the wiki_search limit argument", async () => {
    searchByVectorMock.mockResolvedValue([]);
    const res = await callTool(4, "wiki_search", { query: "topic", limit: 2 });
    expect(res.status).toBe(200);
    expect(searchByVectorMock).toHaveBeenCalledWith("topic", 4);
  });

  it("returns wiki pages as markdown instead of stripped text", async () => {
    getPageByIdMock.mockResolvedValue({ id: "p1", title: "Guide", authorId: "admin_1" });
    getPageBlocksMock.mockResolvedValue([
      {
        id: "b1",
        pageId: "p1",
        type: "heading2",
        content: "Setup",
        properties: null,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "b2",
        pageId: "p1",
        type: "codeBlock",
        content: "npm install",
        properties: { language: "bash" },
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const res = await callTool(5, "wiki_read_page", { pageId: "p1" });
    const body = await res.json();
    expect(body.result.content[0].text).toContain("## Setup");
    expect(body.result.content[0].text).toContain("```bash\nnpm install\n```");
    expect(body.result.structuredContent).toMatchObject({
      pageId: "p1",
      title: "Guide",
      truncated: false,
      nextOffset: null,
    });
  });

  it("paginates long pages with offset/maxLength", async () => {
    getPageByIdMock.mockResolvedValue({ id: "p2", title: "Long", authorId: "admin_1" });
    getPageBlocksMock.mockResolvedValue([
      {
        id: "b1",
        pageId: "p2",
        type: "text",
        content: `line<br />${"x".repeat(2000)}`,
        properties: null,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const res = await callTool(5, "wiki_read_page", { pageId: "p2", maxLength: 800 });
    const body = await res.json();
    expect(body.result.structuredContent.truncated).toBe(true);
    expect(typeof body.result.structuredContent.nextOffset).toBe("number");
    expect(body.result.content[0].text).toContain("offset=");
  });

  it("rejects out-of-range pagination arguments", async () => {
    const res = await callTool(5, "wiki_read_page", { pageId: "p1", maxLength: 999999 });
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("Invalid arguments");
  });

  it("lists visible spaces with write flags", async () => {
    listVisibleSpacesMock.mockResolvedValue([
      { id: "space_1", name: "General", type: "general" },
      { id: "space_2", name: "Team A", type: "team" },
    ]);
    canAccessSpaceMock.mockImplementation(
      async (_user: unknown, space: { id: string }) => space.id === "space_1"
    );
    const res = await callTool(6, "wiki_list_spaces", {});
    const body = await res.json();
    expect(body.result.structuredContent.spaces).toEqual([
      { spaceId: "space_1", name: "General", type: "general", canWrite: true },
      { spaceId: "space_2", name: "Team A", type: "team", canWrite: false },
    ]);
    expect(body.result.content[0].text).toContain("writable");
  });

  it("reports invalid tool arguments as tool execution errors (SEP-1303)", async () => {
    const res = await callTool(5, "wiki_read_page", {});
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("Invalid arguments");
  });

  it("returns a protocol error for unknown tools", async () => {
    const res = await callTool(6, "wiki_delete_page", {});
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
  });

  it("creates a page with a write-scoped token", async () => {
    resolveAgentTokenMock.mockResolvedValue({
      token: tokenRow({ scopes: ["read", "write"] }),
      user: adminUser(),
    });
    createWikiArticleFromMarkdownMock.mockResolvedValue({
      id: "page_9",
      title: "Draft",
      spaceId: "space_1",
    });

    const res = await callTool(7, "wiki_create_page", {
      title: "Draft",
      markdown: "# Draft\n\ncontent",
    });
    const body = await res.json();
    expect(body.result.content[0].text).toContain("page_9");
    expect(body.result.structuredContent).toEqual({
      pageId: "page_9",
      title: "Draft",
      spaceId: "space_1",
    });
    expect(createWikiArticleFromMarkdownMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Draft", markdown: expect.stringContaining("content") })
    );
  });

  it("rejects page creation for read-only tokens with an isError result", async () => {
    resolveAgentTokenMock.mockResolvedValue({
      token: tokenRow({ scopes: ["read"] }),
      user: adminUser(),
    });

    const res = await callTool(8, "wiki_create_page", { title: "x", markdown: "y" });
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("write");
    expect(createWikiArticleFromMarkdownMock).not.toHaveBeenCalled();
  });

  // ─── Rate limiting & audit trail ──────────────────────────────

  it("rate limits tool calls per token", async () => {
    countToolCallsMock.mockResolvedValue(60);
    const res = await callTool(9, "wiki_search", { query: "x" });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.message).toContain("Rate limit exceeded");
    expect(body.error.data.retryAfterMs).toBeGreaterThan(0);
    expect(countToolCallsMock).toHaveBeenCalledWith("mcp.tool.call", "agt_1", expect.any(Date));
  });

  it("records every tool call in the audit log", async () => {
    searchByVectorMock.mockResolvedValue([]);
    await callTool(10, "wiki_search", { query: "x" });
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "mcp.tool.call",
        resourceType: "agent-token",
        resourceId: "agt_1",
      })
    );
    const failed = await callTool(11, "wiki_search", {});
    expect(failed.status).toBe(200);
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "mcp.tool.call",
        resourceId: "agt_1",
        metadata: expect.objectContaining({ ok: false }),
      })
    );
  });

  // ─── Method dispatch ──────────────────────────────────────────

  it("returns 404 with -32601 for unimplemented methods (no legacy initialize)", async () => {
    const res = await post({ id: 9, method: "initialize" });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
  });

  it("returns 404 for removed legacy methods like ping", async () => {
    const res = await post({ id: 10, method: "ping" });
    expect(res.status).toBe(404);
  });

  it("returns 202 without a body for notifications", async () => {
    const res = await mcpRoutes.request("/", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer ech_agt_valid",
        "mcp-protocol-version": PROTOCOL_VERSION,
        "mcp-method": "notifications/cancelled",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/cancelled",
        params: { _meta: meta(PROTOCOL_VERSION) },
      }),
    });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });
});
