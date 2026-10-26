import type {
  CreateMarketingAssetAccessRequest,
  CreateMarketingConnectorRequest,
  CreateMarketingDashboardRequest,
  CreateMarketingReconciliationRequest,
  DeprecateMarketingKnowledgePageRequest,
  GetMarketingAssetResponse,
  GetMarketingChangeResponse,
  MarketingAccessResponse,
  MarketingAssetAccessDto,
  MarketingAssetDto,
  MarketingChangeRequestDto,
  MarketingChangeTransitionRequest,
  MarketingConnectorDto,
  MarketingConnectorTestResponse,
  MarketingConnectorTypeDto,
  MarketingCsvImportResponse,
  MarketingDashboardDto,
  MarketingDashboardExport,
  MarketingDashboardRevisionDto,
  MarketingKnowledgeBootstrapRequest,
  MarketingKnowledgeBootstrapResponse,
  MarketingKnowledgePageDto,
  MarketingMemberDto,
  MarketingMetricsQueryRequest,
  MarketingMetricsQueryResponse,
  MarketingOverviewDto,
  MarketingPageGovernanceResponse,
  MarketingReconciliationDto,
  MarketingSettingsDto,
  MarketingSyncRunDto,
  ReviewMarketingReconciliationRequest,
  SuccessResponse,
  UpdateMarketingConnectorRequest,
  UpdateMarketingDashboardRequest,
  UpdateMarketingSettingsRequest,
  UpsertMarketingAssetRequest,
  UpsertMarketingChangeRequest,
  UpsertMarketingKnowledgePageRequest,
} from "@echolore/shared/contracts";
import { fetchApi } from "./fetch";

const post = (body?: unknown): RequestInit => ({
  method: "POST",
  body: body === undefined ? undefined : JSON.stringify(body),
});
const put = (body: unknown): RequestInit => ({ method: "PUT", body: JSON.stringify(body) });
const del: RequestInit = { method: "DELETE" };

export const marketingApi = {
  access: () => fetchApi<MarketingAccessResponse>("/marketing/access"),
  overview: () => fetchApi<MarketingOverviewDto>("/marketing/overview"),
  members: () => fetchApi<MarketingMemberDto[]>("/marketing/members"),
  getSettings: () => fetchApi<MarketingSettingsDto>("/marketing/settings"),
  updateSettings: (data: UpdateMarketingSettingsRequest) =>
    fetchApi<MarketingSettingsDto>("/marketing/settings", put(data)),
  queryMetrics: (req: MarketingMetricsQueryRequest) =>
    fetchApi<MarketingMetricsQueryResponse>("/marketing/metrics/query", post(req)),

  // Assets
  listAssets: () => fetchApi<MarketingAssetDto[]>("/marketing/assets"),
  getAsset: (id: string) => fetchApi<GetMarketingAssetResponse>(`/marketing/assets/${id}`),
  createAsset: (data: UpsertMarketingAssetRequest) =>
    fetchApi<MarketingAssetDto>("/marketing/assets", post(data)),
  updateAsset: (id: string, data: UpsertMarketingAssetRequest) =>
    fetchApi<MarketingAssetDto>(`/marketing/assets/${id}`, put(data)),
  deleteAsset: (id: string) => fetchApi<SuccessResponse>(`/marketing/assets/${id}`, del),
  verifyAsset: (id: string) =>
    fetchApi<MarketingAssetDto>(`/marketing/assets/${id}/verify`, post()),
  addAssetAccess: (id: string, data: CreateMarketingAssetAccessRequest) =>
    fetchApi<MarketingAssetAccessDto>(`/marketing/assets/${id}/access`, post(data)),
  revokeAssetAccess: (id: string, accessId: string) =>
    fetchApi<MarketingAssetAccessDto>(`/marketing/assets/${id}/access/${accessId}`, del),

  // Connectors
  connectorTypes: () => fetchApi<MarketingConnectorTypeDto[]>("/marketing/connectors/types"),
  listConnectors: () => fetchApi<MarketingConnectorDto[]>("/marketing/connectors"),
  createConnector: (data: CreateMarketingConnectorRequest) =>
    fetchApi<MarketingConnectorDto>("/marketing/connectors", post(data)),
  updateConnector: (id: string, data: UpdateMarketingConnectorRequest) =>
    fetchApi<MarketingConnectorDto>(`/marketing/connectors/${id}`, put(data)),
  deleteConnector: (id: string) => fetchApi<SuccessResponse>(`/marketing/connectors/${id}`, del),
  testConnector: (id: string) =>
    fetchApi<MarketingConnectorTestResponse>(`/marketing/connectors/${id}/test`, post()),
  syncConnector: (id: string) =>
    fetchApi<MarketingSyncRunDto>(`/marketing/connectors/${id}/sync`, post()),
  importCsv: (id: string, data: { csv: string; from?: string; to?: string }) =>
    fetchApi<MarketingCsvImportResponse>(`/marketing/connectors/${id}/import`, post(data)),
  listRuns: (id: string) => fetchApi<MarketingSyncRunDto[]>(`/marketing/connectors/${id}/runs`),

  // Dashboards
  listDashboards: () => fetchApi<MarketingDashboardDto[]>("/marketing/dashboards"),
  getDashboard: (id: string) => fetchApi<MarketingDashboardDto>(`/marketing/dashboards/${id}`),
  createDashboard: (data: CreateMarketingDashboardRequest) =>
    fetchApi<MarketingDashboardDto>("/marketing/dashboards", post(data)),
  createDashboardFromTemplate: () =>
    fetchApi<MarketingDashboardDto>("/marketing/dashboards/from-template", post()),
  importDashboard: (data: MarketingDashboardExport) =>
    fetchApi<MarketingDashboardDto>("/marketing/dashboards/import", post(data)),
  updateDashboard: (id: string, data: UpdateMarketingDashboardRequest) =>
    fetchApi<MarketingDashboardDto>(`/marketing/dashboards/${id}`, put(data)),
  deleteDashboard: (id: string) => fetchApi<SuccessResponse>(`/marketing/dashboards/${id}`, del),
  dashboardRevisions: (id: string) =>
    fetchApi<MarketingDashboardRevisionDto[]>(`/marketing/dashboards/${id}/revisions`),
  restoreDashboard: (id: string, version: number) =>
    fetchApi<MarketingDashboardDto>(
      `/marketing/dashboards/${id}/revisions/${version}/restore`,
      post()
    ),
  exportDashboard: (id: string) =>
    fetchApi<MarketingDashboardExport>(`/marketing/dashboards/${id}/export`),

  // Change requests
  listChanges: (params?: { status?: string[]; assetId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status?.length) qs.set("status", params.status.join(","));
    if (params?.assetId) qs.set("assetId", params.assetId);
    const q = qs.toString();
    return fetchApi<MarketingChangeRequestDto[]>(`/marketing/changes${q ? `?${q}` : ""}`);
  },
  getChange: (id: string) => fetchApi<GetMarketingChangeResponse>(`/marketing/changes/${id}`),
  createChange: (data: UpsertMarketingChangeRequest) =>
    fetchApi<MarketingChangeRequestDto>("/marketing/changes", post(data)),
  updateChange: (id: string, data: UpsertMarketingChangeRequest) =>
    fetchApi<MarketingChangeRequestDto>(`/marketing/changes/${id}`, put(data)),
  transitionChange: (id: string, data: MarketingChangeTransitionRequest) =>
    fetchApi<MarketingChangeRequestDto>(`/marketing/changes/${id}/transition`, post(data)),

  // Knowledge
  listKnowledge: () => fetchApi<MarketingKnowledgePageDto[]>("/marketing/knowledge/pages"),
  registerKnowledge: (data: UpsertMarketingKnowledgePageRequest) =>
    fetchApi<MarketingKnowledgePageDto>("/marketing/knowledge/pages", post(data)),
  updateKnowledge: (id: string, data: Partial<UpsertMarketingKnowledgePageRequest>) =>
    fetchApi<MarketingKnowledgePageDto>(`/marketing/knowledge/pages/${id}`, put(data)),
  approveKnowledge: (id: string) =>
    fetchApi<MarketingKnowledgePageDto>(`/marketing/knowledge/pages/${id}/approve`, post()),
  reviewKnowledge: (id: string) =>
    fetchApi<MarketingKnowledgePageDto>(`/marketing/knowledge/pages/${id}/review`, post()),
  deprecateKnowledge: (id: string, data: DeprecateMarketingKnowledgePageRequest) =>
    fetchApi<MarketingKnowledgePageDto>(`/marketing/knowledge/pages/${id}/deprecate`, post(data)),
  unregisterKnowledge: (id: string) =>
    fetchApi<SuccessResponse>(`/marketing/knowledge/pages/${id}`, del),
  bootstrapKnowledge: (data: MarketingKnowledgeBootstrapRequest) =>
    fetchApi<MarketingKnowledgeBootstrapResponse>("/marketing/knowledge/bootstrap", post(data)),
  pageGovernance: (pageId: string) =>
    fetchApi<MarketingPageGovernanceResponse>(`/marketing/knowledge/by-page/${pageId}`),

  // Reconciliations
  listReconciliations: () => fetchApi<MarketingReconciliationDto[]>("/marketing/reconciliations"),
  createReconciliation: (data: CreateMarketingReconciliationRequest) =>
    fetchApi<MarketingReconciliationDto>("/marketing/reconciliations", post(data)),
  reviewReconciliation: (id: string, data: ReviewMarketingReconciliationRequest) =>
    fetchApi<MarketingReconciliationDto>(`/marketing/reconciliations/${id}/review`, post(data)),
};
