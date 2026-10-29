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
} = vi.hoisted(() => ({
  resolveAgentTokenMock: vi.fn(),
  searchByVectorMock: vi.fn(),
  getPageByIdMock: vi.fn(),
  getPageBlocksMock: vi.fn(),
  auditWikiMaintenanceMock: vi.fn(),
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
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as AgentToken;
}

function authedUser(): SessionUser {
  return adminUser();
}

function post(body: unknown, token: string | null = "ech_agt_valid") {
  return mcpRoutes.request("/", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("mcpRoutes", () => {
  beforeEach(() => {
    resolveAgentTokenMock.mockReset();
    searchByVectorMock.mockReset();
    getPageByIdMock.mockReset();
    getPageBlocksMock.mockReset();
    auditWikiMaintenanceMock.mockReset();
    resolveAgentTokenMock.mockResolvedValue({
      token: tokenRow(),
      user: authedUser(),
    });
  });

  it("rejects requests without a bearer token", async () => {
    const res = await post({ jsonrpc: "2.0", id: 1, method: "initialize" }, null);
    expect(res.status).toBe(401);
  });

  it("rejects invalid or revoked tokens", async () => {
    resolveAgentTokenMock.mockResolvedValue(null);
    const res = await post({ jsonrpc: "2.0", id: 1, method: "initialize" });
    expect(res.status).toBe(401);
  });

  it("rejects non-POST methods", async () => {
    const res = await mcpRoutes.request("/", { method: "GET" });
    expect(res.status).toBe(405);
  });

  it("rejects malformed JSON with a parse error", async () => {
    const res = await mcpRoutes.request("/", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer ech_agt_valid" },
      body: "not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(-32700);
  });

  it("handles initialize with protocol negotiation", async () => {
    const res = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.protocolVersion).toBe("2025-03-26");
    expect(body.result.serverInfo.name).toBe("echolore");
    expect(body.result.capabilities.tools).toBeDefined();
  });

  it("falls back to the latest protocol version for unknown requests", async () => {
    const res = await post({
      jsonrpc: "2.0",
      id: 2,
      method: "initialize",
      params: { protocolVersion: "1999-01-01" },
    });
    const body = await res.json();
    expect(body.result.protocolVersion).toBe("2025-06-18");
  });

  it("answers ping", async () => {
    const res = await post({ jsonrpc: "2.0", id: 3, method: "ping" });
    const body = await res.json();
    expect(body.result).toEqual({});
  });

  it("returns 202 without a body for notifications", async () => {
    const res = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("lists the three read-only tools", async () => {
    const res = await post({ jsonrpc: "2.0", id: 4, method: "tools/list" });
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(["wiki_search", "wiki_read_page", "wiki_maintenance_report"]);
  });

  it("executes tools/call for the maintenance report", async () => {
    auditWikiMaintenanceMock.mockResolvedValue({
      findings: [],
      summary: {},
    });
    const res = await post({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "wiki_maintenance_report", arguments: {} },
    });
    const body = await res.json();
    expect(body.result.content[0].type).toBe("text");
    expect(body.result.content[0].text).toContain("Review overdue");
    expect(auditWikiMaintenanceMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: "admin_1" })
    );
  });

  it("executes tools/call for wiki_search", async () => {
    searchByVectorMock.mockResolvedValue([
      {
        pageId: "p1",
        pageTitle: "Page one",
        chunkText: "content here",
        similarity: 0.9,
      },
    ]);
    const res = await post({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "wiki_search", arguments: { query: "topic" } },
    });
    const body = await res.json();
    expect(body.result.content[0].text).toContain("Page one");
    expect(searchByVectorMock).toHaveBeenCalledWith("topic", 10);
  });

  it("rejects unknown tools with -32602", async () => {
    const res = await post({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "wiki_delete_page", arguments: {} },
    });
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
  });

  it("rejects missing tool arguments with -32602", async () => {
    const res = await post({
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { name: "wiki_read_page", arguments: {} },
    });
    const body = await res.json();
    expect(body.error.code).toBe(-32602);
  });

  it("returns method-not-found for unknown methods", async () => {
    const res = await post({ jsonrpc: "2.0", id: 9, method: "resources/list" });
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
  });
});
