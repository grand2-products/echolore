import type {
  MarketingAccessRole,
  MarketingAssetAccessDto,
  MarketingAssetDto,
  MarketingAssetStatus,
  MarketingAssetType,
  MarketingChangeEventDto,
  MarketingChangeRequestDto,
  MarketingConnectorDto,
  MarketingConnectorType,
  MarketingDashboardDefinition,
  MarketingDashboardDto,
  MarketingDashboardRevisionDto,
  MarketingDocStatus,
  MarketingDocType,
  MarketingKnowledgeLayer,
  MarketingKnowledgePageDto,
  MarketingPrincipalType,
  MarketingReconciliationDto,
  MarketingReconciliationStatus,
  MarketingRunStatus,
  MarketingSyncRunDto,
} from "@echolore/shared/contracts";
import type {
  MarketingAsset,
  MarketingAssetAccess,
  MarketingChangeEvent,
  MarketingChangeRequest,
  MarketingConnector,
  MarketingDashboard,
  MarketingDashboardRevision,
  MarketingReconciliation,
  MarketingSyncRun,
} from "../../db/schema.js";
import type { KnowledgeRow } from "../../repositories/marketing/marketing-knowledge-repository.js";
import { isPostReviewOverdue } from "./marketing-change-workflow.js";
import { isConnectorStale } from "./marketing-metrics-service.js";
import { decryptSecrets } from "./marketing-secrets.js";

type NameMap = Map<string, string>;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const nameOf = (names: NameMap, id: string | null | undefined) =>
  id ? (names.get(id) ?? null) : null;
const DAY_MS = 86_400_000;

export function toAssetDto(
  asset: MarketingAsset,
  names: NameMap,
  now = new Date()
): MarketingAssetDto {
  const verificationOverdue =
    asset.status !== "retired" &&
    (!asset.lastVerifiedAt ||
      now.getTime() - asset.lastVerifiedAt.getTime() > asset.verificationIntervalDays * DAY_MS);
  return {
    id: asset.id,
    type: asset.type as MarketingAssetType,
    name: asset.name,
    externalId: asset.externalId,
    purpose: asset.purpose,
    ownerEntity: asset.ownerEntity,
    billingEntity: asset.billingEntity,
    primaryOwnerUserId: asset.primaryOwnerUserId,
    primaryOwnerName: nameOf(names, asset.primaryOwnerUserId),
    secondaryOwnerUserId: asset.secondaryOwnerUserId,
    secondaryOwnerName: nameOf(names, asset.secondaryOwnerUserId),
    agencyName: asset.agencyName,
    agencyRelationship: asset.agencyRelationship,
    relatedAssetIds: asset.relatedAssetIds ?? [],
    measurementIds: asset.measurementIds ?? [],
    consoleUrl: asset.consoleUrl,
    publicUrl: asset.publicUrl,
    secretReference: asset.secretReference,
    emergencyContact: asset.emergencyContact,
    wikiPageId: asset.wikiPageId,
    notes: asset.notes,
    status: asset.status as MarketingAssetStatus,
    verificationIntervalDays: asset.verificationIntervalDays,
    lastVerifiedAt: iso(asset.lastVerifiedAt),
    lastVerifiedByName: nameOf(names, asset.lastVerifiedByUserId),
    verificationOverdue,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

export function toAssetAccessDto(
  entry: MarketingAssetAccess,
  names: NameMap,
  now = new Date()
): MarketingAssetAccessDto {
  return {
    id: entry.id,
    assetId: entry.assetId,
    principal: entry.principal,
    principalType: entry.principalType as MarketingPrincipalType,
    role: entry.role as MarketingAccessRole,
    scope: entry.scope,
    approvedByUserId: entry.approvedByUserId,
    approvedByName: nameOf(names, entry.approvedByUserId),
    expiresAt: iso(entry.expiresAt),
    revokedAt: iso(entry.revokedAt),
    expired: Boolean(!entry.revokedAt && entry.expiresAt && entry.expiresAt < now),
    createdAt: entry.createdAt.toISOString(),
  };
}

export function toConnectorDto(
  connector: MarketingConnector,
  assetNames: NameMap,
  staleAfterHours: number
): MarketingConnectorDto {
  return {
    id: connector.id,
    name: connector.name,
    type: connector.type as MarketingConnectorType,
    assetId: connector.assetId,
    assetName: nameOf(assetNames, connector.assetId),
    config: connector.config ?? {},
    configuredSecrets: Object.keys(decryptSecrets(connector.secretsEnc)).sort(),
    enabled: connector.enabled,
    syncIntervalHours: connector.syncIntervalHours,
    lookbackDays: connector.lookbackDays,
    timezone: connector.timezone,
    currency: connector.currency,
    lastRunAt: iso(connector.lastRunAt),
    lastSuccessAt: iso(connector.lastSuccessAt),
    lastStatus: (connector.lastStatus as MarketingRunStatus | null) ?? null,
    lastError: connector.lastError,
    stale: isConnectorStale(connector, staleAfterHours),
    createdAt: connector.createdAt.toISOString(),
    updatedAt: connector.updatedAt.toISOString(),
  };
}

export function toSyncRunDto(run: MarketingSyncRun, names: NameMap): MarketingSyncRunDto {
  return {
    id: run.id,
    connectorId: run.connectorId,
    trigger: run.trigger as MarketingSyncRunDto["trigger"],
    status: run.status as MarketingRunStatus,
    rangeFrom: run.rangeFrom,
    rangeTo: run.rangeTo,
    rowsFetched: run.rowsFetched,
    rowsWritten: run.rowsWritten,
    quality: run.quality,
    errorMessage: run.errorMessage,
    triggeredByName: nameOf(names, run.triggeredByUserId),
    startedAt: run.startedAt.toISOString(),
    finishedAt: iso(run.finishedAt),
  };
}

export function dashboardDefinitionOf(d: MarketingDashboard): MarketingDashboardDefinition {
  return {
    name: d.name,
    description: d.description,
    wikiPageId: d.wikiPageId,
    defaultRange: d.defaultRange as MarketingDashboardDefinition["defaultRange"],
    widgets: (d.widgets ?? []) as MarketingDashboardDefinition["widgets"],
  };
}

export function toDashboardDto(
  d: MarketingDashboard,
  names: NameMap,
  defaultDashboardId: string | null
): MarketingDashboardDto {
  return {
    id: d.id,
    ...dashboardDefinitionOf(d),
    version: d.version,
    isDefault: d.id === defaultDashboardId,
    createdByName: nameOf(names, d.createdByUserId),
    updatedByName: nameOf(names, d.updatedByUserId),
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export function toDashboardRevisionDto(
  r: MarketingDashboardRevision,
  names: NameMap
): MarketingDashboardRevisionDto {
  return {
    id: r.id,
    dashboardId: r.dashboardId,
    version: r.version,
    definition: r.definition as unknown as MarketingDashboardDefinition,
    changeNote: r.changeNote,
    authorName: nameOf(names, r.authorUserId),
    createdAt: r.createdAt.toISOString(),
  };
}

export function toChangeDto(
  c: MarketingChangeRequest,
  names: NameMap,
  assetNames: NameMap,
  now = new Date()
): MarketingChangeRequestDto {
  return {
    id: c.id,
    type: c.type as MarketingChangeRequestDto["type"],
    title: c.title,
    purpose: c.purpose,
    assetId: c.assetId,
    assetName: nameOf(assetNames, c.assetId),
    severity: c.severity as MarketingChangeRequestDto["severity"],
    beforeState: c.beforeState,
    afterState: c.afterState,
    impact: c.impact,
    rollbackPlan: c.rollbackPlan,
    scheduledAt: iso(c.scheduledAt),
    status: c.status as MarketingChangeRequestDto["status"],
    requestedByUserId: c.requestedByUserId,
    requestedByName: nameOf(names, c.requestedByUserId),
    approvedByName: nameOf(names, c.approvedByUserId),
    approvedAt: iso(c.approvedAt),
    implementedByName: nameOf(names, c.implementedByUserId),
    implementedAt: iso(c.implementedAt),
    verifiedByName: nameOf(names, c.verifiedByUserId),
    verifiedAt: iso(c.verifiedAt),
    verificationNote: c.verificationNote,
    evidenceUrls: c.evidenceUrls ?? [],
    wikiPageId: c.wikiPageId,
    postReviewDueAt: iso(c.postReviewDueAt),
    postReviewOverdue: isPostReviewOverdue(c, now),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function changeUserIds(c: MarketingChangeRequest) {
  return [c.requestedByUserId, c.approvedByUserId, c.implementedByUserId, c.verifiedByUserId];
}

export function toChangeEventDto(e: MarketingChangeEvent, names: NameMap): MarketingChangeEventDto {
  return {
    id: e.id,
    action: e.action as MarketingChangeEventDto["action"],
    fromStatus: e.fromStatus as MarketingChangeEventDto["fromStatus"],
    toStatus: e.toStatus as MarketingChangeEventDto["toStatus"],
    actorName: nameOf(names, e.actorUserId),
    comment: e.comment,
    createdAt: e.createdAt.toISOString(),
  };
}

export function toKnowledgeDto(
  k: KnowledgeRow,
  names: NameMap,
  pageTitles: NameMap,
  now = new Date()
): MarketingKnowledgePageDto {
  return {
    id: k.id,
    pageId: k.pageId,
    pageTitle: k.pageTitle,
    layer: k.layer as MarketingKnowledgeLayer,
    docType: k.docType as MarketingDocType,
    purpose: k.purpose,
    scope: k.scope,
    ownerUserId: k.ownerUserId,
    ownerName: nameOf(names, k.ownerUserId),
    deputyUserId: k.deputyUserId,
    deputyName: nameOf(names, k.deputyUserId),
    status: k.status as MarketingDocStatus,
    reviewIntervalDays: k.reviewIntervalDays,
    lastReviewedAt: iso(k.lastReviewedAt),
    nextReviewAt: iso(k.nextReviewAt),
    reviewOverdue: k.status !== "deprecated" && Boolean(k.nextReviewAt && k.nextReviewAt < now),
    approvedByName: nameOf(names, k.approvedByUserId),
    approvedAt: iso(k.approvedAt),
    changedSinceApproval: Boolean(
      k.status === "approved" && k.approvedAt && k.pageUpdatedAt && k.pageUpdatedAt > k.approvedAt
    ),
    pageMissing: Boolean(k.pageDeletedAt),
    replacedByPageId: k.replacedByPageId,
    replacedByPageTitle: nameOf(pageTitles, k.replacedByPageId),
    relatedAssetIds: k.relatedAssetIds ?? [],
    notes: k.notes,
    pageUpdatedAt: iso(k.pageUpdatedAt),
    createdAt: k.createdAt.toISOString(),
    updatedAt: k.updatedAt.toISOString(),
  };
}

export function knowledgeUserIds(k: KnowledgeRow) {
  return [k.ownerUserId, k.deputyUserId, k.approvedByUserId];
}

export function toReconciliationDto(
  r: MarketingReconciliation,
  names: NameMap,
  connectorNames: NameMap
): MarketingReconciliationDto {
  const difference = r.sourceValue - r.systemValue;
  const differenceRatio =
    r.sourceValue !== 0 ? difference / r.sourceValue : r.systemValue === 0 ? 0 : null;
  return {
    id: r.id,
    connectorId: r.connectorId,
    connectorName: nameOf(connectorNames, r.connectorId),
    metric: r.metric,
    periodFrom: r.periodFrom,
    periodTo: r.periodTo,
    systemValue: r.systemValue,
    sourceValue: r.sourceValue,
    difference,
    differenceRatio,
    tolerancePct: r.tolerancePct,
    withinTolerance: differenceRatio !== null && Math.abs(differenceRatio) * 100 <= r.tolerancePct,
    explanation: r.explanation,
    status: r.status as MarketingReconciliationStatus,
    createdByUserId: r.createdByUserId,
    createdByName: nameOf(names, r.createdByUserId),
    reviewedByName: nameOf(names, r.reviewedByUserId),
    reviewedAt: iso(r.reviewedAt),
    reviewComment: r.reviewComment,
    createdAt: r.createdAt.toISOString(),
  };
}
