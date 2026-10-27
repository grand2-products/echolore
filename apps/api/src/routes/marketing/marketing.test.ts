import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketingAsset, MarketingConnector, MarketingSyncRun } from "../../db/schema.js";
import type { SessionUser } from "../../lib/auth.js";
import { adminUser, createTestApp, memberUser } from "../../test-utils/index.js";

const NOW = new Date("2026-10-27T00:00:00Z");

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
  getAssetById: vi.fn(),
  createAsset: vi.fn(),
  updateAsset: vi.fn(),
  listConnectors: vi.fn(),
  getConnectorById: vi.fn(),
  updateConnector: vi.fn(),
  getMarketingSettings: vi.fn(),
  importCsvForConnector: vi.fn(),
  runConnectorSync: vi.fn(),
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
  getConnectorById: mocks.getConnectorById,
  updateConnector: mocks.updateConnector,
}));
vi.mock("../../repositories/marketing/marketing-change-repository.js", () => ({
  getChangeById: mocks.getChangeById,
  applyChangeUpdate: mocks.applyChangeUpdate,
}));
vi.mock("../../repositories/marketing/marketing-asset-repository.js", () => ({
  listAssets: mocks.listAssets,
  getAssetById: mocks.getAssetById,
  createAsset: mocks.createAsset,
  updateAsset: mocks.updateAsset,
}));
vi.mock("../../services/marketing/marketing-settings-service.js", () => ({
  getMarketingSettings: mocks.getMarketingSettings,
}));
vi.mock("../../services/marketing/marketing-sync-service.js", () => ({
  importCsvForConnector: mocks.importCsvForConnector,
  runConnectorSync: mocks.runConnectorSync,
  MarketingSyncError: class MarketingSyncError extends Error {
    code = "INVALID" as const;
  },
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
    mocks.getMarketingSettings.mockResolvedValue({
      metricsRetentionMonths: 13,
      runLogRetentionDays: 90,
      staleAfterHours: 36,
      knowledgeSpaceId: null,
      knowledgeRootPageId: null,
      defaultDashboardId: null,
    });
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

function assetRow(
  partial: Partial<MarketingAsset> & Pick<MarketingAsset, "id" | "type">
): MarketingAsset {
  return {
    name: "Asset",
    externalId: null,
    identifiers: {},
    legacyIdentifiersMapped: true,
    purpose: null,
    ownerEntity: null,
    billingEntity: null,
    primaryOwnerUserId: null,
    secondaryOwnerUserId: null,
    agencyName: null,
    agencyRelationship: null,
    relatedAssetIds: [],
    measurementIds: [],
    consoleUrl: null,
    publicUrl: null,
    secretReference: null,
    emergencyContact: null,
    wikiPageId: null,
    notes: null,
    status: "active",
    verificationIntervalDays: 30,
    lastVerifiedAt: null,
    lastVerifiedByUserId: null,
    createdByUserId: "user_1",
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

function connectorRow(
  partial: Partial<MarketingConnector> & Pick<MarketingConnector, "id" | "type">
): MarketingConnector {
  return {
    name: "Connector",
    assetId: null,
    config: {},
    secretsEnc: null,
    enabled: true,
    syncIntervalHours: 24,
    lookbackDays: 7,
    timezone: "Asia/Tokyo",
    currency: null,
    lastRunAt: null,
    lastSuccessAt: null,
    lastStatus: null,
    lastError: null,
    runLockUntil: null,
    createdByUserId: "user_1",
    createdAt: NOW,
    updatedAt: NOW,
    ...partial,
  };
}

describe("marketing asset identifiers", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    mocks.listMembershipsByUser.mockResolvedValue([{ groupId: "g1" }]);
    mocks.getGroupPermissionsByIds.mockResolvedValue([
      { id: "g1", permissions: ["marketing.operate"] },
    ]);
    mocks.insertAuditLog.mockResolvedValue(undefined);
    mocks.getUserNameMap.mockResolvedValue(new Map());
    mocks.listAssets.mockResolvedValue([]);
  });

  it("rejects viewers creating an asset", async () => {
    mocks.getGroupPermissionsByIds.mockResolvedValue([
      { id: "g1", permissions: ["marketing.view"] },
    ]);
    const res = await app(memberUser()).request(
      "/api/marketing/assets",
      json({ type: "other", name: "Brochure" })
    );
    expect(res.status).toBe(403);
    expect(mocks.createAsset).not.toHaveBeenCalled();
  });

  it("stores canonical identifiers and does not call create when they are invalid", async () => {
    mocks.createAsset.mockImplementation(
      async (input: { type: string; name: string; identifiers: Record<string, string> }) =>
        assetRow({
          id: "mka_1",
          type: input.type,
          name: input.name,
          identifiers: input.identifiers,
        })
    );
    const created = await app(memberUser()).request(
      "/api/marketing/assets",
      json({ type: "ga4", name: "Site", identifiers: { propertyId: "properties/123" } })
    );
    expect(created.status).toBe(201);
    expect(mocks.createAsset).toHaveBeenCalledWith(
      expect.objectContaining({ identifiers: { propertyId: "123" } }),
      "user_1"
    );

    mocks.createAsset.mockClear();
    const invalid = await app(memberUser()).request(
      "/api/marketing/assets",
      json({ type: "ga4", name: "Site", identifiers: { propertyId: "nope" } })
    );
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).code).toBe("MARKETING_INVALID_IDENTIFIER");
    expect(mocks.createAsset).not.toHaveBeenCalled();
  });

  it("leaves stored identifiers when an update omits them, including a stripped externalId", async () => {
    mocks.updateAsset.mockImplementation(
      async (
        id: string,
        input: { type?: string; name?: string; identifiers?: Record<string, string> }
      ) =>
        assetRow({
          id,
          type: input.type ?? "ga4",
          name: input.name ?? "Site",
          identifiers: input.identifiers ?? { propertyId: "123" },
        })
    );
    const res = await app(memberUser()).request("/api/marketing/assets/mka_1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "ga4", name: "Renamed", externalId: "999" }),
    });
    expect(res.status).toBe(200);
    const patch = mocks.updateAsset.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(patch).toBeDefined();
    expect(patch).not.toHaveProperty("identifiers");
    expect(patch).not.toHaveProperty("externalId");
    expect(patch?.name).toBe("Renamed");
  });
});

describe("marketing connector identity", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    mocks.listMembershipsByUser.mockResolvedValue([{ groupId: "g1" }]);
    mocks.getGroupPermissionsByIds.mockResolvedValue([
      { id: "g1", permissions: ["marketing.manage"] },
    ]);
    mocks.insertAuditLog.mockResolvedValue(undefined);
    mocks.getUserNameMap.mockResolvedValue(new Map());
    mocks.listAssets.mockResolvedValue([]);
    mocks.getMarketingSettings.mockResolvedValue({
      metricsRetentionMonths: 13,
      runLogRetentionDays: 90,
      staleAfterHours: 36,
      knowledgeSpaceId: null,
      knowledgeRootPageId: null,
      defaultDashboardId: null,
    });
    mocks.createConnector.mockImplementation(async (input: Partial<MarketingConnector>) =>
      connectorRow({
        id: "mkc_1",
        type: input.type ?? "ga4",
        name: input.name ?? "Connector",
        assetId: input.assetId ?? null,
        config: input.config ?? {},
        secretsEnc: input.secretsEnc ?? null,
      })
    );
    mocks.updateConnector.mockImplementation(
      async (id: string, input: Partial<MarketingConnector>) =>
        connectorRow({ id, type: "ga4", ...input })
    );
  });

  it("rejects a new link whose asset type does not match", async () => {
    mocks.getAssetById.mockResolvedValue(assetRow({ id: "mka_meta", type: "meta_ads" }));
    const res = await app(memberUser()).request(
      "/api/marketing/connectors",
      json({
        name: "GA",
        type: "ga4",
        assetId: "mka_meta",
        config: { propertyId: "123" },
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("MARKETING_ASSET_TYPE_MISMATCH");
    expect(mocks.createConnector).not.toHaveBeenCalled();
  });

  it("saves canonical property and customer ids", async () => {
    const ga = await app(memberUser()).request(
      "/api/marketing/connectors",
      json({ name: "GA", type: "ga4", config: { propertyId: "properties/123" } })
    );
    expect(ga.status).toBe(201);
    expect(mocks.createConnector.mock.calls[0]?.[0].config).toEqual({ propertyId: "123" });

    const ads = await app(memberUser()).request(
      "/api/marketing/connectors",
      json({
        name: "Ads",
        type: "google_ads",
        config: { customerId: "123-456-7890", loginCustomerId: "123-456-7890", clientId: "cid" },
      })
    );
    expect(ads.status).toBe(201);
    expect(mocks.createConnector.mock.calls[1]?.[0].config).toEqual({
      customerId: "1234567890",
      loginCustomerId: "1234567890",
      clientId: "cid",
    });
  });

  it("keeps a grandfathered asset link and allows an update that omits assetId", async () => {
    mocks.getConnectorById.mockResolvedValue(
      connectorRow({ id: "mkc_1", type: "ga4", assetId: "mka_meta", config: { propertyId: "123" } })
    );
    mocks.getAssetById.mockResolvedValue(assetRow({ id: "mka_meta", type: "meta_ads" }));
    const kept = await app(memberUser()).request("/api/marketing/connectors/mkc_1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: "mka_meta", name: "Kept" }),
    });
    expect(kept.status).toBe(200);
    expect(mocks.updateConnector).toHaveBeenCalled();

    mocks.updateConnector.mockClear();
    mocks.getAssetById.mockClear();
    const omitted = await app(memberUser()).request("/api/marketing/connectors/mkc_1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(omitted.status).toBe(200);
    expect(mocks.getAssetById).not.toHaveBeenCalled();
  });

  it("lets operators import CSV and keeps viewers out", async () => {
    const run: MarketingSyncRun = {
      id: "run_1",
      connectorId: "mkc_1",
      trigger: "csv",
      status: "success",
      rangeFrom: "2026-10-01",
      rangeTo: "2026-10-01",
      rowsFetched: 1,
      rowsWritten: 1,
      quality: null,
      errorMessage: null,
      triggeredByUserId: "user_1",
      startedAt: NOW,
      finishedAt: NOW,
    };
    mocks.importCsvForConnector.mockResolvedValue(run);
    mocks.getGroupPermissionsByIds.mockResolvedValue([
      { id: "g1", permissions: ["marketing.view"] },
    ]);
    const denied = await app(memberUser()).request(
      "/api/marketing/connectors/mkc_1/import",
      json({ csv: "date\n2026-10-01\n" })
    );
    expect(denied.status).toBe(403);
    expect(mocks.importCsvForConnector).not.toHaveBeenCalled();

    mocks.getGroupPermissionsByIds.mockResolvedValue([
      { id: "g1", permissions: ["marketing.operate"] },
    ]);
    const imported = await app(memberUser()).request(
      "/api/marketing/connectors/mkc_1/import",
      json({ csv: "date\n2026-10-01\n" })
    );
    expect(imported.status).toBe(200);
    expect(mocks.importCsvForConnector).toHaveBeenCalled();
  });

  it("lists connector fields without schema internals", async () => {
    mocks.getGroupPermissionsByIds.mockResolvedValue([
      { id: "g1", permissions: ["marketing.view"] },
    ]);
    const res = await app(memberUser()).request("/api/marketing/connectors/types");
    expect(res.status).toBe(200);
    const types = (await res.json()) as Array<{
      type: string;
      configFields: Array<Record<string, unknown>>;
    }>;
    const ga = types.find((item) => item.type === "ga4");
    expect(ga?.configFields[0]).toEqual({
      key: "propertyId",
      kind: "text",
      required: true,
      placeholder: "123456789",
    });
    expect(JSON.stringify(ga)).not.toContain("connectorConfigKey");
  });
});
