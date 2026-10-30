import { MarketingPermission } from "@echolore/shared/contracts";
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
  queryMetricsMock,
  MetricsQueryErrorMock,
  isConnectorStaleMock,
  listDashboardsMock,
  getDashboardByIdMock,
  overviewMock,
  listConnectorsMock,
  marketingSettingsMock,
  resolveMarketingPermsMock,
  listVisiblePagesMock,
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
  queryMetricsMock: vi.fn(),
  MetricsQueryErrorMock: class MetricsQueryError extends Error {},
  isConnectorStaleMock: vi.fn(),
  listDashboardsMock: vi.fn(),
  getDashboardByIdMock: vi.fn(),
  overviewMock: vi.fn(),
  listConnectorsMock: vi.fn(),
  marketingSettingsMock: vi.fn(),
  resolveMarketingPermsMock: vi.fn(),
  listVisiblePagesMock: vi.fn(),
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

vi.mock("../services/marketing/marketing-metrics-service.js", () => ({
  queryMarketingMetrics: queryMetricsMock,
  isConnectorStale: isConnectorStaleMock,
  MetricsQueryError: MetricsQueryErrorMock,
}));

vi.mock("../repositories/marketing/marketing-dashboard-repository.js", () => ({
  listDashboards: listDashboardsMock,
  getDashboardById: getDashboardByIdMock,
}));

vi.mock("../services/marketing/marketing-overview-service.js", () => ({
  getMarketingOverview: overviewMock,
}));

vi.mock("../repositories/marketing/marketing-connector-repository.js", () => ({
  listConnectors: listConnectorsMock,
}));

vi.mock("../services/marketing/marketing-settings-service.js", () => ({
  getMarketingSettings: marketingSettingsMock,
}));

vi.mock("../policies/marketing-policy.js", () => ({
  resolveMarketingPermissions: resolveMarketingPermsMock,
}));

vi.mock("../services/wiki/wiki-service.js", () => ({
  listVisiblePages: listVisiblePagesMock,
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

function metricsResponse() {
  return {
    from: "2026-10-01",
    to: "2026-10-07",
    metrics: ["cost", "conversions"],
    dimensions: ["source"],
    splitBySource: true,
    splitByCurrency: false,
    rows: [
      { dims: { source: "meta_ads" }, currency: "JPY", values: { cost: 1234.5, conversions: 12 } },
      { dims: { source: "google_ads" }, currency: "JPY", values: { cost: 999, conversions: null } },
    ],
    coverage: [
      {
        connectorId: "c1",
        connectorName: "Meta main",
        type: "meta_ads",
        lastSuccessAt: "2026-10-07T00:00:00.000Z",
        stale: false,
        missingDates: [],
      },
      {
        connectorId: "c2",
        connectorName: "GA4",
        type: "ga4",
        lastSuccessAt: null,
        stale: true,
        missingDates: ["2026-10-06", "2026-10-07"],
      },
    ],
    generatedAt: "2026-10-08T00:00:00.000Z",
  };
}

function overviewResponse() {
  return {
    connectors: { total: 3, healthy: 2, stale: 1, failing: 0, updateSuccessRate: 0.92 },
    assets: {
      total: 8,
      withOwnerAndDeputy: 6,
      verificationOverdue: 1,
      expiredAccess: 0,
      expiringAccess: 1,
    },
    knowledge: {
      total: 12,
      approved: 9,
      reviewOverdue: 1,
      procedureApproved: 3,
      procedureTotal: 4,
    },
    changes: { open: 2, awaitingApproval: 1, postReviewOverdue: 0 },
    reconciliations: { pending: 1 },
  };
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
    queryMetricsMock.mockReset();
    isConnectorStaleMock.mockReset();
    listDashboardsMock.mockReset();
    getDashboardByIdMock.mockReset();
    overviewMock.mockReset();
    listConnectorsMock.mockReset();
    marketingSettingsMock.mockReset();
    resolveMarketingPermsMock.mockReset();
    listVisiblePagesMock.mockReset();
    resolveAgentTokenMock.mockResolvedValue({
      token: tokenRow(),
      user: adminUser() as SessionUser,
    });
    countToolCallsMock.mockResolvedValue(0);
    writeAuditLogMock.mockResolvedValue(undefined);
    listVisibleSpacesMock.mockResolvedValue([]);
    queryMetricsMock.mockResolvedValue(metricsResponse());
    isConnectorStaleMock.mockReturnValue(false);
    listDashboardsMock.mockResolvedValue([]);
    getDashboardByIdMock.mockResolvedValue(null);
    overviewMock.mockResolvedValue(overviewResponse());
    listConnectorsMock.mockResolvedValue([]);
    marketingSettingsMock.mockResolvedValue({ defaultDashboardId: null, staleAfterHours: 36 });
    resolveMarketingPermsMock.mockResolvedValue([MarketingPermission.View]);
    listVisiblePagesMock.mockResolvedValue([]);
  });

  function useReportingToken() {
    resolveAgentTokenMock.mockResolvedValue({
      token: tokenRow({ scopes: ["read", "reporting"] }),
      user: adminUser(),
    });
  }

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
      "wiki_list_pages",
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

  it("lists all six tools for a write-scoped token", async () => {
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
      "wiki_list_pages",
      "wiki_maintenance_report",
      "wiki_create_page",
    ]);
  });

  it("lists marketing reporting tools only for reporting-scoped tokens", async () => {
    useReportingToken();
    const res = await post({ id: 2, method: "tools/list" });
    const body = await res.json();
    expect(body.result.tools.map((t: { name: string }) => t.name)).toEqual([
      "wiki_search",
      "wiki_read_page",
      "wiki_list_spaces",
      "wiki_list_pages",
      "wiki_maintenance_report",
      "marketing_query_metrics",
      "marketing_list_dashboards",
      "marketing_get_dashboard",
      "marketing_data_status",
    ]);
  });

  it("keeps marketing tools hidden from read/write tokens", async () => {
    resolveAgentTokenMock.mockResolvedValue({
      token: tokenRow({ scopes: ["read", "write"] }),
      user: adminUser(),
    });
    const res = await post({ id: 2, method: "tools/list" });
    const body = await res.json();
    expect(body.result.tools.some((t: { name: string }) => t.name.startsWith("marketing_"))).toBe(
      false
    );
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
    // The pagination notice lives in text only — structuredContent stays pure body
    expect(body.result.content[0].text).toContain("[truncated");
    expect(body.result.structuredContent.content).not.toContain("[truncated");
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

  it("lists pages with space filter and pagination", async () => {
    const now = new Date("2026-10-20T00:00:00Z");
    listVisiblePagesMock.mockResolvedValue([
      { id: "p1", title: "Page one", spaceId: "space_1", parentId: null, updatedAt: now },
      { id: "p2", title: "Page two", spaceId: "space_1", parentId: "p1", updatedAt: now },
      { id: "p3", title: "Other space", spaceId: "space_2", parentId: null, updatedAt: now },
    ]);

    const res = await callTool(7, "wiki_list_pages", { spaceId: "space_1", limit: 1 });
    const body = await res.json();
    expect(body.result.structuredContent).toEqual({
      total: 2,
      offset: 0,
      limit: 1,
      pages: [
        {
          pageId: "p1",
          title: "Page one",
          spaceId: "space_1",
          parentId: null,
          updatedAt: now.toISOString(),
        },
      ],
    });
    expect(body.result.content[0].text).toContain("2 page(s)");
    expect(body.result.content[0].text).toContain("offset=1");
  });

  it("lists all visible pages when spaceId is omitted", async () => {
    const now = new Date("2026-10-20T00:00:00Z");
    listVisiblePagesMock.mockResolvedValue([
      { id: "p1", title: "Page one", spaceId: "space_1", parentId: null, updatedAt: now },
    ]);
    const res = await callTool(7, "wiki_list_pages", {});
    const body = await res.json();
    expect(body.result.structuredContent.total).toBe(1);
    expect(body.result.structuredContent.pages[0].pageId).toBe("p1");
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

  // ─── Marketing reporting tools ────────────────────────────────

  it("queries marketing metrics with structured output and coverage warnings", async () => {
    useReportingToken();
    const res = await callTool(20, "marketing_query_metrics", {
      metrics: ["cost", "conversions"],
      from: "2026-10-01",
      to: "2026-10-07",
      dimensions: ["source"],
    });
    const body = await res.json();
    expect(queryMetricsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "2026-10-01",
        to: "2026-10-07",
        metrics: ["cost", "conversions"],
        dimensions: ["source"],
      })
    );
    expect(body.result.structuredContent.rows).toHaveLength(2);
    expect(body.result.content[0].text).toContain("GA4");
    expect(body.result.content[0].text).toContain("未取得");
    // Derived metric nulls (算定不可) are preserved, not zeroed
    expect(body.result.structuredContent.rows[1].values.conversions).toBeNull();
  });

  it("defaults the query period to the last 7 days when from/to are omitted", async () => {
    useReportingToken();
    const res = await callTool(21, "marketing_query_metrics", { metrics: ["cost"] });
    expect(res.status).toBe(200);
    const request = queryMetricsMock.mock.calls[0]?.[0] as { from: string; to: string };
    expect(request.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const days =
      (new Date(request.to).getTime() - new Date(request.from).getTime()) / 86_400_000 + 1;
    expect(days).toBe(7);
  });

  it("rejects unknown metric keys as invalid arguments", async () => {
    useReportingToken();
    const res = await callTool(22, "marketing_query_metrics", { metrics: ["roas2"] });
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("Invalid arguments");
    expect(queryMetricsMock).not.toHaveBeenCalled();
  });

  it("surfaces MetricsQueryError as a self-correctable tool error", async () => {
    useReportingToken();
    queryMetricsMock.mockRejectedValue(new MetricsQueryErrorMock("Range must be at most 400 days"));
    const res = await callTool(23, "marketing_query_metrics", {
      metrics: ["cost"],
      from: "2020-01-01",
      to: "2026-10-01",
    });
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("Range must be at most 400 days");
  });

  it("denies marketing tools when the token creator lacks marketing.view", async () => {
    useReportingToken();
    resolveMarketingPermsMock.mockResolvedValue([]);
    const res = await callTool(24, "marketing_data_status", {});
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("Permission denied");
    expect(body.result.content[0].text).toContain("marketing.view");
    expect(overviewMock).not.toHaveBeenCalled();
  });

  it("rejects marketing tool calls without the reporting scope", async () => {
    resolveAgentTokenMock.mockResolvedValue({
      token: tokenRow({ scopes: ["read"] }),
      user: adminUser(),
    });
    const res = await callTool(25, "marketing_query_metrics", { metrics: ["cost"] });
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toContain("reporting");
    expect(queryMetricsMock).not.toHaveBeenCalled();
  });

  it("lists dashboards with version and default flag", async () => {
    useReportingToken();
    const now = new Date();
    listDashboardsMock.mockResolvedValue([
      {
        id: "dash_1",
        name: "経営・運用ダッシュボード",
        description: null,
        wikiPageId: null,
        defaultRange: "last_7_days",
        widgets: [{ id: "w1" }, { id: "w2" }],
        version: 3,
        updatedAt: now,
      },
    ]);
    marketingSettingsMock.mockResolvedValue({ defaultDashboardId: "dash_1", staleAfterHours: 36 });

    const res = await callTool(26, "marketing_list_dashboards", {});
    const body = await res.json();
    expect(body.result.structuredContent.dashboards).toEqual([
      {
        dashboardId: "dash_1",
        name: "経営・運用ダッシュボード",
        description: null,
        version: 3,
        isDefault: true,
        defaultRange: "last_7_days",
        widgetCount: 2,
        updatedAt: now.toISOString(),
      },
    ]);
    expect(body.result.content[0].text).toContain("v3");
    expect(body.result.content[0].text).toContain("default");
  });

  it("reads a dashboard definition with widgets", async () => {
    useReportingToken();
    getDashboardByIdMock.mockResolvedValue({
      id: "dash_1",
      name: "経営・運用ダッシュボード",
      description: "MVP dashboard",
      wikiPageId: "page_1",
      defaultRange: "last_28_days",
      widgets: [{ id: "w1", type: "kpi", title: "広告費", metrics: ["cost"] }],
      version: 2,
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    });

    const res = await callTool(27, "marketing_get_dashboard", { dashboardId: "dash_1" });
    const body = await res.json();
    expect(body.result.structuredContent).toMatchObject({
      dashboardId: "dash_1",
      version: 2,
      defaultRange: "last_28_days",
      isDefault: false,
    });
    expect(body.result.structuredContent.widgets).toHaveLength(1);
    expect(body.result.content[0].text).toContain("[kpi] 広告費");
  });

  it("reports data status with connector freshness", async () => {
    useReportingToken();
    isConnectorStaleMock.mockReturnValue(true);
    listConnectorsMock.mockResolvedValue([
      {
        id: "c1",
        name: "Meta main",
        type: "meta_ads",
        enabled: true,
        lastStatus: "success",
        lastSuccessAt: new Date("2026-10-01T00:00:00Z"),
      },
    ]);

    const res = await callTool(28, "marketing_data_status", {});
    const body = await res.json();
    expect(body.result.structuredContent.overview.connectors.updateSuccessRate).toBe(0.92);
    expect(body.result.structuredContent.connectors[0]).toMatchObject({
      connectorId: "c1",
      name: "Meta main",
      stale: true,
    });
    expect(body.result.content[0].text).toContain("STALE");
    expect(body.result.content[0].text).toContain("92%");
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
