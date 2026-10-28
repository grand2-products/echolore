/**
 * Marketing operations contracts.
 *
 * Covers the asset register, generic data connectors, the metric dictionary
 * (KPI 辞書), composable dashboards, change approval, numeric reconciliation
 * and Wiki knowledge governance. See docs/marketing-operations.md.
 */

import type { ISODateString } from "./index.js";

// ─── Permissions ─────────────────────────────────────────────────

export const MarketingPermission = {
  /** Read dashboards, register, knowledge registry, change log. */
  View: "marketing.view",
  /** Edit register, dashboards, change requests, CSV import, knowledge metadata. */
  Operate: "marketing.operate",
  /** Approve change requests, knowledge pages and reconciliations (never one's own). */
  Review: "marketing.review",
  /** Manage connectors, credentials, settings and deletions. */
  Manage: "marketing.manage",
} as const;
export type MarketingPermission = (typeof MarketingPermission)[keyof typeof MarketingPermission];
export const ALL_MARKETING_PERMISSIONS = Object.values(MarketingPermission);

export interface MarketingAccessResponse {
  permissions: MarketingPermission[];
}

/** People holding any marketing permission (owner / approver pickers). */
export interface MarketingMemberDto {
  id: string;
  name: string;
  email: string;
  permissions: MarketingPermission[];
}

// ─── Asset register (資産台帳) ───────────────────────────────────

export const MARKETING_ASSET_TYPES = [
  "meta_ads",
  "google_ads",
  "ga4",
  "gtm",
  "landing_page",
  "domain",
  "other",
] as const;
export type MarketingAssetType = (typeof MARKETING_ASSET_TYPES)[number];

export const MARKETING_ASSET_STATUSES = ["active", "migrating", "retired"] as const;
export type MarketingAssetStatus = (typeof MARKETING_ASSET_STATUSES)[number];

export interface MarketingAssetDto {
  id: string;
  type: MarketingAssetType;
  /** サービス名 / display name */
  name: string;
  /**
   * Type-specific external identifiers. Keys come from
   * `ASSET_IDENTIFIER_SCHEMAS`. Values are stored in canonical form.
   */
  identifiers: Record<string, string>;
  purpose: string | null;
  /** 所有主体 */
  ownerEntity: string | null;
  /** 請求主体 */
  billingEntity: string | null;
  primaryOwnerUserId: string | null;
  primaryOwnerName: string | null;
  secondaryOwnerUserId: string | null;
  secondaryOwnerName: string | null;
  /** 代理店名 */
  agencyName: string | null;
  /** 代理店との契約・共有関係 */
  agencyRelationship: string | null;
  /** 関連資産 (LP, 計測 etc.) */
  relatedAssetIds: string[];
  /** 管理画面URL */
  consoleUrl: string | null;
  /** 公開URL (LP など) */
  publicUrl: string | null;
  /** 保管庫の参照先. Never a secret itself. */
  secretReference: string | null;
  /** 緊急時の代行者・連絡先 */
  emergencyContact: string | null;
  /** 手順・根拠の Wiki ページ */
  wikiPageId: string | null;
  notes: string | null;
  status: MarketingAssetStatus;
  verificationIntervalDays: number;
  lastVerifiedAt: ISODateString | null;
  lastVerifiedByName: string | null;
  verificationOverdue: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface UpsertMarketingAssetRequest {
  type: MarketingAssetType;
  name: string;
  /**
   * Omitted on update leaves stored identifiers unchanged. Present values
   * replace the whole object after server-side normalization.
   */
  identifiers?: Record<string, string>;
  purpose?: string | null;
  ownerEntity?: string | null;
  billingEntity?: string | null;
  primaryOwnerUserId?: string | null;
  secondaryOwnerUserId?: string | null;
  agencyName?: string | null;
  agencyRelationship?: string | null;
  relatedAssetIds?: string[];
  consoleUrl?: string | null;
  publicUrl?: string | null;
  secretReference?: string | null;
  emergencyContact?: string | null;
  wikiPageId?: string | null;
  notes?: string | null;
  status?: MarketingAssetStatus;
  verificationIntervalDays?: number;
}

export const MARKETING_ACCESS_ROLES = [
  "viewer",
  "editor",
  "publisher",
  "billing",
  "admin",
] as const;
export type MarketingAccessRole = (typeof MARKETING_ACCESS_ROLES)[number];

export const MARKETING_PRINCIPAL_TYPES = ["employee", "agency", "contractor", "service"] as const;
export type MarketingPrincipalType = (typeof MARKETING_PRINCIPAL_TYPES)[number];

/** Who holds which permission inside the external service (権限一覧). */
export interface MarketingAssetAccessDto {
  id: string;
  assetId: string;
  principal: string;
  principalType: MarketingPrincipalType;
  role: MarketingAccessRole;
  scope: string | null;
  approvedByUserId: string | null;
  approvedByName: string | null;
  expiresAt: ISODateString | null;
  revokedAt: ISODateString | null;
  expired: boolean;
  createdAt: ISODateString;
}

export interface CreateMarketingAssetAccessRequest {
  principal: string;
  principalType: MarketingPrincipalType;
  role: MarketingAccessRole;
  scope?: string | null;
  expiresAt?: ISODateString | null;
}

export interface GetMarketingAssetResponse {
  asset: MarketingAssetDto;
  access: MarketingAssetAccessDto[];
}

// ─── Connectors ──────────────────────────────────────────────────

export const MARKETING_CONNECTOR_TYPES = [
  "meta_ads",
  "google_ads",
  "ga4",
  "lp_monitor",
  "csv",
] as const;
export type MarketingConnectorType = (typeof MARKETING_CONNECTOR_TYPES)[number];

export type MarketingConnectorFieldKind = "text" | "textarea" | "number" | "boolean" | "list";

export interface MarketingConnectorFieldSpec {
  key: string;
  kind: MarketingConnectorFieldKind;
  required: boolean;
  placeholder?: string;
}

export interface MarketingConnectorTypeDto {
  type: MarketingConnectorType;
  configFields: MarketingConnectorFieldSpec[];
  secretFields: MarketingConnectorFieldSpec[];
  /** True when the connector fetches from an API on a schedule. */
  supportsSync: boolean;
  /** Every connector accepts CSV import with the same metric definitions. */
  supportsCsvImport: boolean;
  /** Base metric keys this connector can produce. */
  metrics: string[];
  /** Timezone and currency come from the account or property, not the form. */
  accountLocale: boolean;
}

export type MarketingRunStatus = "running" | "success" | "partial" | "failed";

export interface MarketingConnectorDto {
  id: string;
  name: string;
  type: MarketingConnectorType;
  assetId: string | null;
  assetName: string | null;
  config: Record<string, unknown>;
  /** Names of secret fields that currently hold a value. Values are never returned. */
  configuredSecrets: string[];
  enabled: boolean;
  syncIntervalHours: number;
  lookbackDays: number;
  /** Null until an account or property read succeeds. CSV and LP checks always set one. */
  timezone: string | null;
  currency: string | null;
  lastRunAt: ISODateString | null;
  lastSuccessAt: ISODateString | null;
  lastStatus: MarketingRunStatus | null;
  lastError: string | null;
  /** Last success is older than the configured stale threshold. */
  stale: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface CreateMarketingConnectorRequest {
  name: string;
  type: MarketingConnectorType;
  assetId?: string | null;
  config?: Record<string, unknown>;
  /** Write-only. Omitted keys keep their stored value; empty string clears. */
  secrets?: Record<string, string>;
  enabled?: boolean;
  syncIntervalHours?: number;
  lookbackDays?: number;
  timezone?: string;
  currency?: string | null;
}

export type UpdateMarketingConnectorRequest = Partial<
  Omit<CreateMarketingConnectorRequest, "type">
>;

export interface MarketingQualityReportDto {
  rowCount: number;
  duplicateKeys: number;
  negativeValues: number;
  invalidRows: number;
  /** Dates in the requested range for which the source returned no rows. */
  emptyDates: string[];
  warnings: string[];
}

export interface MarketingSyncRunDto {
  id: string;
  connectorId: string;
  trigger: "schedule" | "manual" | "csv";
  status: MarketingRunStatus;
  rangeFrom: string;
  rangeTo: string;
  rowsFetched: number;
  rowsWritten: number;
  quality: MarketingQualityReportDto | null;
  errorMessage: string | null;
  triggeredByName: string | null;
  startedAt: ISODateString;
  finishedAt: ISODateString | null;
}

export interface MarketingConnectorTestResponse {
  ok: boolean;
  message: string;
}

export interface MarketingCsvImportResponse {
  run: MarketingSyncRunDto;
}

// ─── Metric dictionary (KPI 辞書) ────────────────────────────────

export type MarketingMetricUnit = "currency" | "count" | "ratio" | "ms";
export type MarketingMetricGroup = "acquisition" | "site" | "business" | "ratio" | "health";

export interface MarketingMetricDefinition {
  key: string;
  unit: MarketingMetricUnit;
  group: MarketingMetricGroup;
  /** Base metrics are stored; derived metrics are computed as numerator ÷ denominator of sums. */
  kind: "base" | "derived";
  numerator?: string;
  denominator?: string;
  /**
   * False when values from different sources must never be added together
   * (e.g. Meta CV + Google CV). Queries are then split by source automatically.
   */
  summableAcrossSources: boolean;
  /** For ratios: true when a higher value is better (used for comparison colouring). */
  higherIsBetter: boolean;
}

const base = (
  key: string,
  unit: MarketingMetricUnit,
  group: MarketingMetricGroup,
  summableAcrossSources = true,
  higherIsBetter = true
): MarketingMetricDefinition => ({
  key,
  unit,
  group,
  kind: "base",
  summableAcrossSources,
  higherIsBetter,
});

const derived = (
  key: string,
  unit: MarketingMetricUnit,
  numerator: string,
  denominator: string,
  higherIsBetter: boolean
): MarketingMetricDefinition => ({
  key,
  unit,
  group: "ratio",
  kind: "derived",
  numerator,
  denominator,
  // Resolved at runtime from the components (see isSummableAcrossSources).
  summableAcrossSources: true,
  higherIsBetter,
});

export const MARKETING_METRICS: MarketingMetricDefinition[] = [
  // 配信・獲得
  base("cost", "currency", "acquisition", true, false),
  base("impressions", "count", "acquisition"),
  base("clicks", "count", "acquisition"),
  base("conversions", "count", "acquisition", false),
  base("conversion_value", "currency", "acquisition", false),
  // サイト行動 (GA4)
  base("sessions", "count", "site"),
  base("lp_views", "count", "site"),
  base("form_starts", "count", "site"),
  base("form_submits", "count", "site"),
  base("key_events", "count", "site", false),
  // 事業成果
  base("inquiries", "count", "business", false),
  base("revenue", "currency", "business", false),
  // 稼働点検
  base("uptime_checks", "count", "health"),
  base("uptime_successes", "count", "health"),
  base("response_ms_total", "ms", "health", true, false),
  // 比率・収益
  derived("ctr", "ratio", "clicks", "impressions", true),
  derived("cpc", "currency", "cost", "clicks", false),
  derived("cpa", "currency", "cost", "conversions", false),
  derived("cvr", "ratio", "form_submits", "sessions", true),
  derived("form_completion_rate", "ratio", "form_submits", "form_starts", true),
  derived("roas", "ratio", "conversion_value", "cost", true),
  derived("availability", "ratio", "uptime_successes", "uptime_checks", true),
  derived("avg_response_ms", "ms", "response_ms_total", "uptime_checks", false),
];

export const MARKETING_METRIC_MAP: Record<string, MarketingMetricDefinition> = Object.fromEntries(
  MARKETING_METRICS.map((m) => [m.key, m])
);

export const MARKETING_BASE_METRIC_KEYS = MARKETING_METRICS.filter((m) => m.kind === "base").map(
  (m) => m.key
);

/** Base metric keys a metric depends on (itself for base metrics). */
export function marketingMetricComponents(key: string): string[] {
  const def = MARKETING_METRIC_MAP[key];
  if (!def) return [];
  if (def.kind === "base") return [def.key];
  return [def.numerator, def.denominator].filter((k): k is string => Boolean(k));
}

export function isSummableAcrossSources(key: string): boolean {
  const def = MARKETING_METRIC_MAP[key];
  if (!def) return false;
  if (def.kind === "base") return def.summableAcrossSources;
  return marketingMetricComponents(key).every(
    (component) => MARKETING_METRIC_MAP[component]?.summableAcrossSources ?? false
  );
}

// ─── Metric queries ──────────────────────────────────────────────

export const MARKETING_DIMENSIONS = [
  "date",
  "source",
  "connector",
  "account",
  "campaign",
  "segment",
] as const;
export type MarketingDimension = (typeof MARKETING_DIMENSIONS)[number];

export interface MarketingMetricFilters {
  sources?: MarketingConnectorType[];
  connectorIds?: string[];
  accountIds?: string[];
  campaignIds?: string[];
  segments?: string[];
}

export interface MarketingMetricsQueryRequest {
  /** Inclusive, YYYY-MM-DD */
  from: string;
  /** Inclusive, YYYY-MM-DD */
  to: string;
  metrics: string[];
  dimensions?: MarketingDimension[];
  filters?: MarketingMetricFilters;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  limit?: number;
}

export interface MarketingMetricsRowDto {
  /** Dimension values. `campaign` rows also carry `campaignName`. */
  dims: Partial<Record<MarketingDimension | "campaignName" | "connectorName", string>>;
  currency: string | null;
  /** null = 算定不可 (zero denominator) */
  values: Record<string, number | null>;
}

export interface MarketingCoverageDto {
  connectorId: string;
  connectorName: string;
  type: MarketingConnectorType;
  lastSuccessAt: ISODateString | null;
  stale: boolean;
  /** Dates in range never covered by a successful run (未取得 — never treated as zero). */
  missingDates: string[];
}

export interface MarketingMetricsQueryResponse {
  from: string;
  to: string;
  metrics: string[];
  /** Effective dimensions; `source` is added when a metric is not summable across sources. */
  dimensions: MarketingDimension[];
  splitBySource: boolean;
  /** True when more than one currency is present; rows are then split by currency. */
  splitByCurrency: boolean;
  rows: MarketingMetricsRowDto[];
  coverage: MarketingCoverageDto[];
  generatedAt: ISODateString;
}

// ─── Dashboards (Dashboard-as-Code) ──────────────────────────────

export const MARKETING_WIDGET_TYPES = [
  "kpi",
  "timeseries",
  "breakdown",
  "funnel",
  "freshness",
  "assets",
  "changes",
  "reviews",
  "links",
  "note",
] as const;
export type MarketingWidgetType = (typeof MARKETING_WIDGET_TYPES)[number];

export const MARKETING_DATE_RANGES = [
  "last_7_days",
  "last_28_days",
  "this_month",
  "last_month",
  "last_90_days",
] as const;
export type MarketingDateRange = (typeof MARKETING_DATE_RANGES)[number];

export interface MarketingWidgetLink {
  label: string;
  url: string;
}

export interface MarketingWidgetDto {
  id: string;
  type: MarketingWidgetType;
  title: string;
  /** Grid columns out of 3. */
  width: 1 | 2 | 3;
  metrics?: string[];
  /** breakdown: grouping dimension */
  dimension?: MarketingDimension;
  filters?: MarketingMetricFilters;
  /** kpi: compare with the previous period of equal length */
  compare?: boolean;
  limit?: number;
  /** 根拠・手順への導線 */
  wikiPageId?: string | null;
  /** note */
  text?: string;
  /** links */
  links?: MarketingWidgetLink[];
}

export interface MarketingDashboardDefinition {
  name: string;
  description: string | null;
  wikiPageId: string | null;
  defaultRange: MarketingDateRange;
  widgets: MarketingWidgetDto[];
}

export interface MarketingDashboardDto extends MarketingDashboardDefinition {
  id: string;
  /** Release number shown on screen; incremented on every save. */
  version: number;
  isDefault: boolean;
  createdByName: string | null;
  updatedByName: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface CreateMarketingDashboardRequest extends MarketingDashboardDefinition {
  changeNote?: string;
}

export interface UpdateMarketingDashboardRequest extends MarketingDashboardDefinition {
  /** 変更理由 — required for every revision */
  changeNote: string;
  /** Version the edit was based on; a mismatch returns 409 instead of overwriting. */
  expectedVersion?: number;
}

export interface MarketingDashboardRevisionDto {
  id: string;
  dashboardId: string;
  version: number;
  definition: MarketingDashboardDefinition;
  changeNote: string;
  authorName: string | null;
  createdAt: ISODateString;
}

/** Portable JSON for keeping dashboards under version control. */
export interface MarketingDashboardExport {
  format: "echolore.marketing-dashboard";
  formatVersion: 1;
  exportedAt: ISODateString;
  version: number;
  definition: MarketingDashboardDefinition;
}

// ─── Change requests (Issue → 承認 → 実施 → 検証 → 完了) ─────────

export const MARKETING_CHANGE_TYPES = [
  "ad_launch",
  "budget_change",
  "ad_stop",
  "measurement",
  "lp_release",
  "dashboard_release",
  "emergency",
  "incident",
  "other",
] as const;
export type MarketingChangeType = (typeof MARKETING_CHANGE_TYPES)[number];

export const MARKETING_CHANGE_STATUSES = [
  "open",
  "in_review",
  "approved",
  "rejected",
  "implemented",
  "verified",
  "closed",
] as const;
export type MarketingChangeStatus = (typeof MARKETING_CHANGE_STATUSES)[number];

export const MARKETING_SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type MarketingSeverity = (typeof MARKETING_SEVERITIES)[number];

export const MARKETING_CHANGE_ACTIONS = [
  "submit",
  "approve",
  "reject",
  "implement",
  "verify",
  "close",
  "reopen",
  "comment",
] as const;
export type MarketingChangeAction = (typeof MARKETING_CHANGE_ACTIONS)[number];

/** Types that may be implemented before approval and require a post-review. */
export const MARKETING_POST_REVIEW_TYPES: readonly MarketingChangeType[] = [
  "emergency",
  "incident",
];

export interface MarketingChangeEventDto {
  id: string;
  action: MarketingChangeAction | "create" | "update";
  fromStatus: MarketingChangeStatus | null;
  toStatus: MarketingChangeStatus | null;
  actorName: string | null;
  comment: string | null;
  createdAt: ISODateString;
}

export interface MarketingChangeRequestDto {
  id: string;
  type: MarketingChangeType;
  title: string;
  purpose: string | null;
  assetId: string | null;
  assetName: string | null;
  severity: MarketingSeverity | null;
  beforeState: string | null;
  afterState: string | null;
  impact: string | null;
  rollbackPlan: string | null;
  scheduledAt: ISODateString | null;
  status: MarketingChangeStatus;
  requestedByUserId: string | null;
  requestedByName: string | null;
  approvedByName: string | null;
  approvedAt: ISODateString | null;
  implementedByName: string | null;
  implementedAt: ISODateString | null;
  verifiedByName: string | null;
  verifiedAt: ISODateString | null;
  verificationNote: string | null;
  evidenceUrls: string[];
  wikiPageId: string | null;
  /** Emergency / incident: post-review due date (翌営業日). */
  postReviewDueAt: ISODateString | null;
  postReviewOverdue: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface GetMarketingChangeResponse {
  change: MarketingChangeRequestDto;
  events: MarketingChangeEventDto[];
}

export interface UpsertMarketingChangeRequest {
  type: MarketingChangeType;
  title: string;
  purpose?: string | null;
  assetId?: string | null;
  severity?: MarketingSeverity | null;
  beforeState?: string | null;
  afterState?: string | null;
  impact?: string | null;
  rollbackPlan?: string | null;
  scheduledAt?: ISODateString | null;
  evidenceUrls?: string[];
  wikiPageId?: string | null;
}

export interface MarketingChangeTransitionRequest {
  action: MarketingChangeAction;
  comment?: string | null;
  /** verify: 検証結果・証跡 */
  verificationNote?: string | null;
  evidenceUrls?: string[];
}

// ─── Knowledge governance (Wiki) ─────────────────────────────────

export const MARKETING_KNOWLEDGE_LAYERS = [
  "policy",
  "assets",
  "measurement",
  "procedure",
  "initiative",
  "enablement",
] as const;
export type MarketingKnowledgeLayer = (typeof MARKETING_KNOWLEDGE_LAYERS)[number];

export const MARKETING_DOC_TYPES = ["general", "procedure", "initiative", "incident"] as const;
export type MarketingDocType = (typeof MARKETING_DOC_TYPES)[number];

export const MARKETING_DOC_STATUSES = ["draft", "approved", "deprecated"] as const;
export type MarketingDocStatus = (typeof MARKETING_DOC_STATUSES)[number];

export interface MarketingKnowledgePageDto {
  id: string;
  pageId: string;
  pageTitle: string | null;
  layer: MarketingKnowledgeLayer;
  docType: MarketingDocType;
  purpose: string | null;
  scope: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  deputyUserId: string | null;
  deputyName: string | null;
  status: MarketingDocStatus;
  reviewIntervalDays: number;
  lastReviewedAt: ISODateString | null;
  nextReviewAt: ISODateString | null;
  reviewOverdue: boolean;
  approvedByName: string | null;
  approvedAt: ISODateString | null;
  /** The Wiki page was edited after approval (再承認待ち). */
  changedSinceApproval: boolean;
  /** The Wiki page has been moved to the trash. */
  pageMissing: boolean;
  replacedByPageId: string | null;
  replacedByPageTitle: string | null;
  relatedAssetIds: string[];
  notes: string | null;
  pageUpdatedAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface UpsertMarketingKnowledgePageRequest {
  pageId: string;
  layer: MarketingKnowledgeLayer;
  docType?: MarketingDocType;
  purpose?: string | null;
  scope?: string | null;
  ownerUserId?: string | null;
  deputyUserId?: string | null;
  reviewIntervalDays?: number;
  relatedAssetIds?: string[];
  notes?: string | null;
}

export interface DeprecateMarketingKnowledgePageRequest {
  replacedByPageId?: string | null;
  reason?: string | null;
}

export interface MarketingKnowledgeBootstrapRequest {
  /** Team space group. Omit to create the tree in the General space. */
  groupId?: string | null;
}

export interface MarketingKnowledgeBootstrapResponse {
  spaceId: string;
  rootPageId: string;
  createdPageIds: string[];
}

export interface MarketingPageGovernanceResponse {
  governance: MarketingKnowledgePageDto | null;
}

// ─── Reconciliation (元画面との数値照合) ─────────────────────────

export const MARKETING_RECONCILIATION_STATUSES = ["pending", "approved", "rejected"] as const;
export type MarketingReconciliationStatus = (typeof MARKETING_RECONCILIATION_STATUSES)[number];

export interface MarketingReconciliationDto {
  id: string;
  connectorId: string;
  connectorName: string | null;
  metric: string;
  periodFrom: string;
  periodTo: string;
  /** Computed by the server from stored data at creation time. */
  systemValue: number;
  /** Value read from the source console (元画面). */
  sourceValue: number;
  difference: number;
  differenceRatio: number | null;
  tolerancePct: number;
  withinTolerance: boolean;
  explanation: string | null;
  status: MarketingReconciliationStatus;
  createdByUserId: string | null;
  createdByName: string | null;
  reviewedByName: string | null;
  reviewedAt: ISODateString | null;
  reviewComment: string | null;
  createdAt: ISODateString;
}

export interface CreateMarketingReconciliationRequest {
  connectorId: string;
  metric: string;
  periodFrom: string;
  periodTo: string;
  sourceValue: number;
  tolerancePct?: number;
  explanation?: string | null;
}

export interface ReviewMarketingReconciliationRequest {
  decision: "approved" | "rejected";
  comment?: string | null;
}

// ─── Overview / operating health ─────────────────────────────────

export interface MarketingOverviewDto {
  connectors: {
    total: number;
    healthy: number;
    stale: number;
    failing: number;
    /** 定時更新の達成率 over the last 28 days (successful days ÷ scheduled days). */
    updateSuccessRate: number | null;
  };
  assets: {
    total: number;
    /** 資産・権限の管理率: assets with both a primary and secondary owner. */
    withOwnerAndDeputy: number;
    verificationOverdue: number;
    expiredAccess: number;
    expiringAccess: number;
  };
  knowledge: {
    total: number;
    approved: number;
    reviewOverdue: number;
    /** 重要手順の整備率: approved procedures ÷ procedures. */
    procedureApproved: number;
    procedureTotal: number;
  };
  changes: {
    open: number;
    awaitingApproval: number;
    postReviewOverdue: number;
  };
  reconciliations: {
    pending: number;
  };
}

// ─── Settings ────────────────────────────────────────────────────

export interface MarketingSettingsDto {
  /** 集計データ保存期間 */
  metricsRetentionMonths: number;
  /** 処理ログ保存期間 */
  runLogRetentionDays: number;
  /** Data older than this is shown with a stale warning. */
  staleAfterHours: number;
  knowledgeSpaceId: string | null;
  knowledgeRootPageId: string | null;
  defaultDashboardId: string | null;
}

export type UpdateMarketingSettingsRequest = Partial<MarketingSettingsDto>;
