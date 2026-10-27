import {
  MARKETING_ACCESS_ROLES,
  MARKETING_ASSET_STATUSES,
  MARKETING_ASSET_TYPES,
  MARKETING_CHANGE_ACTIONS,
  MARKETING_CHANGE_TYPES,
  MARKETING_CONNECTOR_TYPES,
  MARKETING_DATE_RANGES,
  MARKETING_DIMENSIONS,
  MARKETING_DOC_TYPES,
  MARKETING_KNOWLEDGE_LAYERS,
  MARKETING_METRIC_MAP,
  MARKETING_PRINCIPAL_TYPES,
  MARKETING_SEVERITIES,
  MARKETING_WIDGET_TYPES,
} from "@echolore/shared/contracts";
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const id = z.string().min(1).max(100);
/** Only http(s) links may be stored — they are rendered as anchors. */
const httpUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => /^https?:\/\//i.test(v), "Only http(s) URLs are allowed");
const optionalUrl = httpUrl
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));
const metricKey = z.string().refine((k) => Boolean(MARKETING_METRIC_MAP[k]), "Unknown metric");

// ─── Assets ──────────────────────────────────────────────────────

export const upsertAssetSchema = z.object({
  type: z.enum(MARKETING_ASSET_TYPES),
  name: z.string().trim().min(1).max(200),
  identifiers: z.record(z.string().trim().min(1).max(100), z.string().trim().max(300)).optional(),
  purpose: optionalText(2000),
  ownerEntity: optionalText(200),
  billingEntity: optionalText(200),
  primaryOwnerUserId: id.nullable().optional(),
  secondaryOwnerUserId: id.nullable().optional(),
  agencyName: optionalText(200),
  agencyRelationship: optionalText(2000),
  relatedAssetIds: z.array(id).max(50).optional(),
  consoleUrl: optionalUrl,
  publicUrl: optionalUrl,
  secretReference: optionalText(500),
  emergencyContact: optionalText(1000),
  wikiPageId: id.nullable().optional(),
  notes: optionalText(5000),
  status: z.enum(MARKETING_ASSET_STATUSES).optional(),
  verificationIntervalDays: z.number().int().min(1).max(365).optional(),
});

export const createAssetAccessSchema = z.object({
  principal: z.string().trim().min(1).max(200),
  principalType: z.enum(MARKETING_PRINCIPAL_TYPES),
  role: z.enum(MARKETING_ACCESS_ROLES),
  scope: optionalText(1000),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional().or(isoDate),
});

// ─── Connectors ──────────────────────────────────────────────────

const connectorBase = {
  name: z.string().trim().min(1).max(200),
  assetId: id.nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  secrets: z.record(z.string(), z.string().max(20_000)).optional(),
  enabled: z.boolean().optional(),
  syncIntervalHours: z.number().int().min(1).max(168).optional(),
  lookbackDays: z.number().int().min(1).max(90).optional(),
  timezone: z.string().min(1).max(100).optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "ISO 4217 code")
    .nullable()
    .optional(),
};

export const createConnectorSchema = z.object({
  ...connectorBase,
  type: z.enum(MARKETING_CONNECTOR_TYPES),
});

export const updateConnectorSchema = z.object(connectorBase).partial();

export const csvImportSchema = z.object({
  csv: z
    .string()
    .min(1)
    .max(5 * 1024 * 1024),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

// ─── Metrics ─────────────────────────────────────────────────────

const filtersSchema = z
  .object({
    sources: z.array(z.enum(MARKETING_CONNECTOR_TYPES)).max(10).optional(),
    connectorIds: z.array(id).max(50).optional(),
    accountIds: z.array(z.string().max(200)).max(50).optional(),
    campaignIds: z.array(z.string().max(200)).max(200).optional(),
    segments: z.array(z.string().max(1000)).max(200).optional(),
  })
  .optional();

export const metricsQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
  metrics: z.array(metricKey).min(1).max(20),
  dimensions: z.array(z.enum(MARKETING_DIMENSIONS)).max(3).optional(),
  filters: filtersSchema,
  sortBy: z.string().max(50).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().min(1).max(5000).optional(),
});

// ─── Dashboards ──────────────────────────────────────────────────

const widgetSchema = z.object({
  id: z.string().trim().min(1).max(50),
  type: z.enum(MARKETING_WIDGET_TYPES),
  title: z.string().trim().max(200),
  width: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  metrics: z.array(metricKey).max(10).optional(),
  dimension: z.enum(MARKETING_DIMENSIONS).optional(),
  filters: filtersSchema,
  compare: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  wikiPageId: id.nullable().optional(),
  text: z.string().max(5000).optional(),
  links: z
    .array(z.object({ label: z.string().trim().min(1).max(100), url: httpUrl }))
    .max(20)
    .optional(),
});

export const dashboardDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable(),
  wikiPageId: id.nullable(),
  defaultRange: z.enum(MARKETING_DATE_RANGES),
  widgets: z
    .array(widgetSchema)
    .max(30)
    .refine((ws) => new Set(ws.map((w) => w.id)).size === ws.length, "Widget ids must be unique"),
});

export const createDashboardSchema = dashboardDefinitionSchema.extend({
  changeNote: z.string().trim().max(1000).optional(),
});

export const updateDashboardSchema = dashboardDefinitionSchema.extend({
  changeNote: z.string().trim().min(1, "変更理由は必須です").max(1000),
  expectedVersion: z.number().int().min(1).optional(),
});

export const importDashboardSchema = z.object({
  format: z.literal("echolore.marketing-dashboard"),
  formatVersion: z.literal(1),
  definition: dashboardDefinitionSchema,
});

// ─── Changes ─────────────────────────────────────────────────────

export const upsertChangeSchema = z.object({
  type: z.enum(MARKETING_CHANGE_TYPES),
  title: z.string().trim().min(1).max(300),
  purpose: optionalText(5000),
  assetId: id.nullable().optional(),
  severity: z.enum(MARKETING_SEVERITIES).nullable().optional(),
  beforeState: optionalText(5000),
  afterState: optionalText(5000),
  impact: optionalText(5000),
  rollbackPlan: optionalText(5000),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  evidenceUrls: z.array(httpUrl).max(20).optional(),
  wikiPageId: id.nullable().optional(),
});

export const changeTransitionSchema = z.object({
  action: z.enum(MARKETING_CHANGE_ACTIONS),
  comment: optionalText(5000),
  verificationNote: optionalText(5000),
  evidenceUrls: z.array(httpUrl).max(20).optional(),
});

export const listChangesQuerySchema = z.object({
  status: z.string().max(200).optional(),
  type: z.enum(MARKETING_CHANGE_TYPES).optional(),
  assetId: id.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

// ─── Knowledge ───────────────────────────────────────────────────

const knowledgeFields = {
  layer: z.enum(MARKETING_KNOWLEDGE_LAYERS),
  docType: z.enum(MARKETING_DOC_TYPES).optional(),
  purpose: optionalText(2000),
  scope: optionalText(2000),
  ownerUserId: id.nullable().optional(),
  deputyUserId: id.nullable().optional(),
  reviewIntervalDays: z.number().int().min(7).max(730).optional(),
  relatedAssetIds: z.array(id).max(50).optional(),
  notes: optionalText(5000),
};

export const registerKnowledgeSchema = z.object({ pageId: id, ...knowledgeFields });
export const updateKnowledgeSchema = z.object(knowledgeFields).partial();

export const deprecateKnowledgeSchema = z.object({
  replacedByPageId: id.nullable().optional(),
  reason: optionalText(2000),
});

export const bootstrapKnowledgeSchema = z.object({ groupId: id.nullable().optional() });

// ─── Reconciliations ─────────────────────────────────────────────

export const createReconciliationSchema = z.object({
  connectorId: id,
  metric: metricKey,
  periodFrom: isoDate,
  periodTo: isoDate,
  sourceValue: z.number().finite(),
  tolerancePct: z.number().min(0).max(100).optional(),
  explanation: optionalText(5000),
});

export const reviewReconciliationSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: optionalText(2000),
});

// ─── Settings ────────────────────────────────────────────────────

export const updateMarketingSettingsSchema = z.object({
  metricsRetentionMonths: z.number().int().min(1).max(120).optional(),
  runLogRetentionDays: z.number().int().min(7).max(3650).optional(),
  staleAfterHours: z.number().int().min(1).max(720).optional(),
  knowledgeSpaceId: id.nullable().optional(),
  knowledgeRootPageId: id.nullable().optional(),
  defaultDashboardId: id.nullable().optional(),
});
