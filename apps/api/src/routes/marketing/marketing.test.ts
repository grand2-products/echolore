import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "../../lib/auth.js";
import { adminUser, createTestApp, memberUser } from "../../test-utils/index.js";

const mocks = vi.hoisted(() => ({
  listMembershipsByUser: vi.fn(),
  getGroupPermissionsByIds: vi.fn(),
  insertAuditLog: vi.fn(),
  getMarketingOverview: vi.fn(),
  createConnector: vi.fn(),
  getChangeById: vi.fn(),
  applyChangeUpdate: vi.fn(),
  getReconciliationById: vi.fn(),
  reviewReconciliation: vi.fn(),
  getPageById: vi.fn(),
  canReadPage: vi.fn(),
  getKnowledgePageByPageId: vi.fn(),
  getUserNameMap: vi.fn(),
  getPageTitleMap: vi.fn(),
  listAssets: vi.fn(),
  listConnectors: vi.fn(),
}));

vi.mock("../../repositories/admin/admin-repository.js", () => ({
  listMembershipsByUser: mocks.listMembershipsByUser,
  getGroupPermissionsByIds: mocks.getGroupPermissionsByIds,
}));
vi.mock("../../repositories/audit/audit-repository.js", () => ({
  insertAuditLog: mocks.insertAuditLog,
}));
vi.mock("../../services/marketing/marketing-overview-service.js", () => ({
  getMarketingOverview: mocks.getMarketingOverview,
}));
vi.mock("../../repositories/marketing/marketing-connector-repository.js", () => ({
  createConnector: mocks.createConnector,
  listConnectors: mocks.listConnectors,
}));
vi.mock("../../repositories/marketing/marketing-change-repository.js", () => ({
  getChangeById: mocks.getChangeById,
  applyChangeUpdate: mocks.applyChangeUpdate,
}));
vi.mock("../../repositories/marketing/marketing-asset-repository.js", () => ({
  listAssets: mocks.listAssets,
}));
vi.mock("../../repositories/marketing/marketing-knowledge-repository.js", () => ({
  getReconciliationById: mocks.getReconciliationById,
  reviewReconciliation: mocks.reviewReconciliation,
  getKnowledgePageByPageId: mocks.getKnowledgePageByPageId,
  getUserNameMap: mocks.getUserNameMap,
  getPageTitleMap: mocks.getPageTitleMap,
}));
vi.mock("../../repositories/wiki/wiki-repository.js", () => ({
  getPageById: mocks.getPageById,
}));
vi.mock("../../policies/authorization-policy.js", () => ({
  canReadPage: mocks.canReadPage,
}));

const { marketingRoutes } = await import("./index.js");

function app(user: SessionUser) {
  return createTestApp("/api/marketing", marketingRoutes, user);
}

function grant(...permissions: string[]) {
  mocks.listMembershipsByUser.mockResolvedValue([{ groupId: "g1" }]);
  mocks.getGroupPermissionsByIds.mockResolvedValue([{ id: "g1", permissions }]);
}

const json = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("marketing routes authorization", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    mocks.listMembershipsByUser.mockResolvedValue([]);
    mocks.getGroupPermissionsByIds.mockResolvedValue([]);
    mocks.insertAuditLog.mockResolvedValue(undefined);
    mocks.getUserNameMap.mockResolvedValue(new Map());
    mocks.getPageTitleMap.mockResolvedValue(new Map());
    mocks.listAssets.mockResolvedValue([]);
    mocks.listConnectors.mockResolvedValue([]);
  });

  it("reports no permissions for members outside marketing groups", async () => {
    const res = await app(memberUser()).request("/api/marketing/access");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ permissions: [] });
  });

  it("expands implied permissions (manage ⊇ operate ⊇ view, review is separate)", async () => {
    grant("marketing.manage", "wiki.read");
    const res = await app(memberUser()).request("/api/marketing/access");
    expect(await res.json()).toEqual({
      permissions: ["marketing.view", "marketing.operate", "marketing.manage"],
    });
  });

  it("grants admins every marketing permission", async () => {
    const res = await app(adminUser()).request("/api/marketing/access");
    expect((await res.json()).permissions).toHaveLength(4);
  });

  it("rejects members without marketing.view and records the denial", async () => {
    const res = await app(memberUser()).request("/api/marketing/overview");
    expect(res.status).toBe(403);
    expect(mocks.getMarketingOverview).not.toHaveBeenCalled();
    expect(mocks.insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "authz.denied", resourceType: "marketing" })
    );
  });

  it("allows viewers to read the overview", async () => {
    grant("marketing.view");
    mocks.getMarketingOverview.mockResolvedValue({ connectors: { total: 0 } });
    const res = await app(memberUser()).request("/api/marketing/overview");
    expect(res.status).toBe(200);
  });

  it("requires marketing.manage to create connectors (operators cannot hold credentials)", async () => {
    grant("marketing.operate");
    const res = await app(memberUser()).request(
      "/api/marketing/connectors",
      json({ name: "Meta", type: "meta_ads", config: { adAccountId: "1" } })
    );
    expect(res.status).toBe(403);
    expect(mocks.createConnector).not.toHaveBeenCalled();
  });

  it("blocks self-approval of a change request", async () => {
    grant("marketing.review", "marketing.operate");
    mocks.getChangeById.mockResolvedValue({
      id: "ch1",
      type: "budget_change",
      status: "in_review",
      requestedByUserId: "user_1",
      approvedAt: null,
    });
    const res = await app(memberUser()).request(
      "/api/marketing/changes/ch1/transition",
      json({ action: "approve" })
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("MARKETING_SELF_APPROVAL");
    expect(mocks.applyChangeUpdate).not.toHaveBeenCalled();
  });

  it("blocks self-review of a reconciliation", async () => {
    grant("marketing.review");
    mocks.getReconciliationById.mockResolvedValue({
      id: "r1",
      createdByUserId: "user_1",
      sourceValue: 100,
      systemValue: 100,
      tolerancePct: 1,
      explanation: null,
    });
    const res = await app(memberUser()).request(
      "/api/marketing/reconciliations/r1/review",
      json({ decision: "approved" })
    );
    expect(res.status).toBe(403);
    expect(mocks.reviewReconciliation).not.toHaveBeenCalled();
  });

  it("requires an explanation before approving a difference beyond tolerance", async () => {
    grant("marketing.review");
    mocks.getReconciliationById.mockResolvedValue({
      id: "r1",
      createdByUserId: "someone_else",
      sourceValue: 100,
      systemValue: 90,
      tolerancePct: 1,
      explanation: null,
    });
    const res = await app(memberUser()).request(
      "/api/marketing/reconciliations/r1/review",
      json({ decision: "approved" })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("MARKETING_EXPLANATION_REQUIRED");
  });

  it("serves page governance to Wiki readers without marketing.view", async () => {
    mocks.getPageById.mockResolvedValue({ id: "p1", authorId: "author" });
    mocks.canReadPage.mockResolvedValue(true);
    mocks.getKnowledgePageByPageId.mockResolvedValue(null);
    const res = await app(memberUser()).request("/api/marketing/knowledge/by-page/p1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ governance: null });
  });

  it("hides page governance when the Wiki page is not readable", async () => {
    mocks.getPageById.mockResolvedValue({ id: "p1", authorId: "author" });
    mocks.canReadPage.mockResolvedValue(false);
    const res = await app(memberUser()).request("/api/marketing/knowledge/by-page/p1");
    expect(res.status).toBe(404);
    expect(mocks.getKnowledgePageByPageId).not.toHaveBeenCalled();
  });

  it("keeps the rest of the knowledge API behind marketing.view", async () => {
    const res = await app(memberUser()).request("/api/marketing/knowledge/pages");
    expect(res.status).toBe(403);
  });
});
