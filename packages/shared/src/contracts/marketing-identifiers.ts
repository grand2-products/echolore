/**
 * Identifier schemas for marketing assets and connectors.
 *
 * Asset governance fields stay shared. Only external identifiers vary by
 * type. Fetch config stays on the connector; this module never describes
 * credentials.
 */

import type { MarketingAssetType, MarketingConnectorType } from "./marketing.js";

export type IdentifierNormalize =
  | "trim"
  | "trim_upper"
  | "digits"
  | "ga4_property"
  | "meta_ad_account"
  | "google_customer";

export interface SharedIdentityField {
  key: string;
  kind: "text";
  required: boolean;
  maxLength: number;
  pattern: string;
  patternMessage: string;
  normalize: IdentifierNormalize;
  placeholder?: string;
  accountId?: boolean;
  connectorConfigKey?: string;
}

export interface AssetIdentifierSchema {
  fields: readonly SharedIdentityField[];
}

export type ConnectorFieldKind = "text" | "textarea" | "number" | "boolean" | "list";

export interface ConnectorOnlyField {
  key: string;
  kind: ConnectorFieldKind;
  required: boolean;
  placeholder?: string;
  normalize?: IdentifierNormalize;
  pattern?: string;
  patternMessage?: string;
  enumValues?: readonly string[];
  listMin?: number;
  listMax?: number;
}

export type ConnectorConfigField = SharedIdentityField | ConnectorOnlyField;

export interface ConnectorSchema {
  configFields: readonly ConnectorConfigField[];
  secretFields: readonly { key: string; kind: "text" | "textarea"; required: boolean }[];
}

export interface ConnectorFieldSpec {
  key: string;
  kind: ConnectorFieldKind;
  required: boolean;
  placeholder?: string;
}

const CREDENTIAL = /private_key|BEGIN PRIVATE KEY|BEGIN RSA PRIVATE KEY|BEGIN OPENSSH PRIVATE KEY/i;
const CREDENTIAL_MESSAGE = "identifier value must not contain a credential";

export const ga4PropertyId: SharedIdentityField = {
  key: "propertyId",
  kind: "text",
  required: true,
  maxLength: 200,
  pattern: "^\\d+$",
  patternMessage: "propertyId must be numeric",
  normalize: "ga4_property",
  placeholder: "123456789",
  accountId: true,
  connectorConfigKey: "propertyId",
};

export const ga4MeasurementId: SharedIdentityField = {
  key: "measurementId",
  kind: "text",
  required: false,
  maxLength: 200,
  pattern: "^G-[A-Z0-9]+$",
  patternMessage: "measurementId must look like G-XXXX",
  normalize: "trim_upper",
  placeholder: "G-XXXXXXXXXX",
};

export const metaAdAccountId: SharedIdentityField = {
  key: "adAccountId",
  kind: "text",
  required: true,
  maxLength: 200,
  pattern: "^\\d+$",
  patternMessage: "adAccountId must be numeric (optionally prefixed with act_)",
  normalize: "meta_ad_account",
  placeholder: "act_1234567890",
  accountId: true,
  connectorConfigKey: "adAccountId",
};

export const metaPixelId: SharedIdentityField = {
  key: "pixelId",
  kind: "text",
  required: false,
  maxLength: 200,
  pattern: "^\\d+$",
  patternMessage: "pixelId must be numeric",
  normalize: "digits",
  placeholder: "1234567890",
};

export const googleCustomerId: SharedIdentityField = {
  key: "customerId",
  kind: "text",
  required: true,
  maxLength: 200,
  pattern: "^\\d{10}$",
  patternMessage: "customerId must be a 10-digit Google Ads customer ID",
  normalize: "google_customer",
  placeholder: "123-456-7890",
  accountId: true,
  connectorConfigKey: "customerId",
};

export const gtmContainerId: SharedIdentityField = {
  key: "containerId",
  kind: "text",
  required: true,
  maxLength: 200,
  pattern: "^GTM-[A-Z0-9]+$",
  patternMessage: "containerId must look like GTM-XXXX",
  normalize: "trim_upper",
  placeholder: "GTM-XXXXXXX",
};

export const domainHostname: SharedIdentityField = {
  key: "hostname",
  kind: "text",
  required: true,
  maxLength: 200,
  pattern: "^[a-z0-9.-]+$",
  patternMessage: "hostname is invalid",
  normalize: "trim",
};

export const otherLabel: SharedIdentityField = {
  key: "label",
  kind: "text",
  required: false,
  maxLength: 200,
  pattern: "^[\\s\\S]+$",
  patternMessage: "label is invalid",
  normalize: "trim",
};

export const ASSET_IDENTIFIER_SCHEMAS: Record<MarketingAssetType, AssetIdentifierSchema> = {
  ga4: { fields: [ga4PropertyId, ga4MeasurementId] },
  meta_ads: { fields: [metaAdAccountId, metaPixelId] },
  google_ads: { fields: [googleCustomerId] },
  gtm: { fields: [gtmContainerId] },
  landing_page: { fields: [] },
  domain: { fields: [domainHostname] },
  other: { fields: [otherLabel] },
};

const landingPagePaths: ConnectorOnlyField = {
  key: "landingPagePaths",
  kind: "list",
  required: false,
  placeholder: "/lp/spring, /lp/form",
};
const formStartEvent: ConnectorOnlyField = {
  key: "formStartEvent",
  kind: "text",
  required: false,
  placeholder: "form_start",
};
const formSubmitEvent: ConnectorOnlyField = {
  key: "formSubmitEvent",
  kind: "text",
  required: false,
  placeholder: "form_submit",
};
const useGcpDefaults: ConnectorOnlyField = {
  key: "useGcpDefaults",
  kind: "boolean",
  required: false,
};
const conversionActionTypes: ConnectorOnlyField = {
  key: "conversionActionTypes",
  kind: "list",
  required: false,
  placeholder: "offsite_conversion.fb_pixel_lead, lead",
};
const clickType: ConnectorOnlyField = {
  key: "clickType",
  kind: "text",
  required: false,
  placeholder: "link | all",
  enumValues: ["link", "all"],
};
const metaApiVersion: ConnectorOnlyField = {
  key: "apiVersion",
  kind: "text",
  required: false,
  placeholder: "v23.0",
};
const loginCustomerId: ConnectorOnlyField = {
  key: "loginCustomerId",
  kind: "text",
  required: false,
  placeholder: "MCC ID (optional)",
  normalize: "google_customer",
  pattern: "^\\d{10}$",
  patternMessage: "loginCustomerId must be a 10-digit ID",
};
const clientId: ConnectorOnlyField = { key: "clientId", kind: "text", required: true };
const googleApiVersion: ConnectorOnlyField = {
  key: "apiVersion",
  kind: "text",
  required: false,
  placeholder: "v23",
};
const urls: ConnectorOnlyField = {
  key: "urls",
  kind: "list",
  required: true,
  placeholder: "https://example.com/lp/spring",
  listMin: 1,
  listMax: 50,
};
const expectedTags: ConnectorOnlyField = {
  key: "expectedTags",
  kind: "list",
  required: false,
  placeholder: "GTM-XXXXXXX, G-XXXXXXXXXX",
};
const requireForm: ConnectorOnlyField = { key: "requireForm", kind: "boolean", required: false };
const description: ConnectorOnlyField = { key: "description", kind: "textarea", required: false };

export const CONNECTOR_SCHEMAS: Record<MarketingConnectorType, ConnectorSchema> = {
  ga4: {
    configFields: [
      ga4PropertyId,
      landingPagePaths,
      formStartEvent,
      formSubmitEvent,
      useGcpDefaults,
    ],
    secretFields: [{ key: "serviceAccountKeyJson", kind: "textarea", required: false }],
  },
  meta_ads: {
    configFields: [metaAdAccountId, conversionActionTypes, clickType, metaApiVersion],
    secretFields: [{ key: "accessToken", kind: "textarea", required: true }],
  },
  google_ads: {
    configFields: [googleCustomerId, loginCustomerId, clientId, googleApiVersion],
    secretFields: [
      { key: "developerToken", kind: "text", required: true },
      { key: "clientSecret", kind: "text", required: true },
      { key: "refreshToken", kind: "textarea", required: true },
    ],
  },
  lp_monitor: {
    configFields: [urls, expectedTags, requireForm],
    secretFields: [],
  },
  csv: {
    configFields: [description],
    secretFields: [],
  },
};

/** null means any asset type may be linked. */
export const CONNECTOR_LINKED_ASSET_TYPES: Record<
  MarketingConnectorType,
  readonly MarketingAssetType[] | null
> = {
  ga4: ["ga4"],
  meta_ads: ["meta_ads"],
  google_ads: ["google_ads"],
  lp_monitor: ["landing_page"],
  csv: null,
};

export function connectorIdentityKeys(type: MarketingConnectorType): string[] {
  return CONNECTOR_SCHEMAS[type].configFields
    .filter(isSharedIdentity)
    .map((field) => field.connectorConfigKey)
    .filter((key): key is string => Boolean(key));
}

export function projectConnectorFields(type: MarketingConnectorType): {
  configFields: ConnectorFieldSpec[];
  secretFields: ConnectorFieldSpec[];
} {
  const schema = CONNECTOR_SCHEMAS[type];
  return {
    configFields: schema.configFields.map(projectField),
    secretFields: schema.secretFields.map((field) => ({
      key: field.key,
      kind: field.kind,
      required: field.required,
    })),
  };
}

export type NormalizeAssetResult =
  | { ok: true; value: Record<string, string> }
  | { ok: false; message: string; issues: { key: string; message: string }[] };

export function normalizeAssetIdentifiers(
  type: MarketingAssetType,
  input: Record<string, unknown> | null | undefined
): NormalizeAssetResult {
  const schema = ASSET_IDENTIFIER_SCHEMAS[type];
  const source = input ?? {};
  const issues: { key: string; message: string }[] = [];
  if (
    input !== null &&
    input !== undefined &&
    (typeof input !== "object" || Array.isArray(input))
  ) {
    return {
      ok: false,
      message: "identifiers must be an object",
      issues: [{ key: "", message: "identifiers must be an object" }],
    };
  }
  const known = new Set(schema.fields.map((field) => field.key));
  for (const key of Object.keys(source)) {
    if (!known.has(key)) issues.push({ key, message: `Unknown identifier: ${key}` });
    const raw = source[key];
    if (typeof raw !== "string") {
      issues.push({ key, message: `${key} must be a string` });
      continue;
    }
    if (CREDENTIAL.test(raw)) issues.push({ key, message: CREDENTIAL_MESSAGE });
  }
  const value: Record<string, string> = {};
  for (const field of schema.fields) {
    const raw = source[field.key];
    if (typeof raw !== "string") {
      if (field.required && raw === undefined)
        issues.push({ key: field.key, message: `${field.key} is required` });
      continue;
    }
    if (field.key === "hostname") {
      const host = normalizeHostname(raw);
      if (!host.ok) {
        if (raw.trim() === "" && !field.required) continue;
        issues.push({ key: field.key, message: host.message });
      } else {
        value[field.key] = host.value;
      }
      continue;
    }
    const normalized = applyNormalize(field.normalize, raw);
    if (normalized.empty) {
      if (field.required) issues.push({ key: field.key, message: `${field.key} is required` });
      continue;
    }
    if (!normalized.ok) {
      issues.push({ key: field.key, message: field.patternMessage });
      continue;
    }
    if (
      normalized.value.length > field.maxLength ||
      !new RegExp(field.pattern).test(normalized.value)
    ) {
      issues.push({
        key: field.key,
        message:
          normalized.value.length > field.maxLength
            ? `${field.key} is too long`
            : field.patternMessage,
      });
      continue;
    }
    if (CREDENTIAL.test(normalized.value)) {
      issues.push({ key: field.key, message: CREDENTIAL_MESSAGE });
      continue;
    }
    value[field.key] = normalized.value;
  }
  const first = issues[0];
  if (first) return { ok: false, message: first.message, issues };
  return { ok: true, value };
}

export function normalizeHostname(
  input: string
): { ok: true; value: string } | { ok: false; message: string } {
  const trimmed = input.trim();
  const looksLikeUrl = trimmed.includes("://") || trimmed.startsWith("//");
  let host = trimmed;
  if (looksLikeUrl) {
    const toParse = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
    let url: URL;
    try {
      url = new URL(toParse);
    } catch {
      return { ok: false, message: "hostname is invalid" };
    }
    if (url.username || url.password || url.port || url.search || url.hash) {
      return { ok: false, message: "hostname is invalid" };
    }
    if (url.pathname !== "" && url.pathname !== "/")
      return { ok: false, message: "hostname is invalid" };
    const extracted = extractAuthorityHost(trimmed).replace(/\.$/, "").toLowerCase();
    if (url.hostname !== extracted) return { ok: false, message: "hostname is invalid" };
    host = url.hostname;
  }
  if (host.endsWith(".")) host = host.slice(0, -1);
  host = host.toLowerCase();
  if (host.length === 0 || host.length > 200) return { ok: false, message: "hostname is invalid" };
  const labels = host.split(".");
  if (labels.length < 2) return { ok: false, message: "hostname is invalid" };
  for (const label of labels) {
    const ok =
      label.length === 1
        ? /^[a-z0-9]$/.test(label)
        : /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
    if (!ok) return { ok: false, message: "hostname is invalid" };
  }
  if (host.includes(":") || labels.every((label) => /^\d+$/.test(label))) {
    return { ok: false, message: "hostname is invalid" };
  }
  return { ok: true, value: host };
}

/** PR1 predicate. Does not canonicalize and rejects properties/ and customers/. */
export function legacyValidateConnectorConfig(
  type: MarketingConnectorType,
  config: Record<string, unknown>
): string | null {
  if (type === "ga4") {
    return /^\d+$/.test(configString(config, "propertyId")) ? null : "propertyId must be numeric";
  }
  if (type === "meta_ads") {
    if (!/^(act_)?\d+$/.test(configString(config, "adAccountId"))) {
      return "adAccountId must be numeric (optionally prefixed with act_)";
    }
    const click = configString(config, "clickType");
    if (click && click !== "link" && click !== "all") return "clickType must be 'link' or 'all'";
    return null;
  }
  if (type === "google_ads") {
    if (!/^\d{10}$/.test(digitsOnly(configString(config, "customerId")))) {
      return "customerId must be a 10-digit Google Ads customer ID";
    }
    const login = digitsOnly(configString(config, "loginCustomerId"));
    if (login && !/^\d{10}$/.test(login)) return "loginCustomerId must be a 10-digit ID";
    if (!configString(config, "clientId")) return "clientId is required";
    return null;
  }
  if (type === "lp_monitor") {
    const list = configList(config, "urls");
    if (list.length === 0) return "At least one URL is required";
    if (list.length > 50) return "At most 50 URLs per connector";
    for (const item of list) {
      try {
        const parsed = new URL(item);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
          return `Invalid URL: ${item}`;
      } catch {
        return `Invalid URL: ${item}`;
      }
    }
    return null;
  }
  return null;
}

export type NormalizeConnectorResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; message: string };

export function normalizeConnectorConfig(
  type: MarketingConnectorType,
  config: Record<string, unknown>
): NormalizeConnectorResult {
  const schema = CONNECTOR_SCHEMAS[type];
  const known = new Map(schema.configFields.map((field) => [field.key, field]));
  for (const key of Object.keys(config)) {
    if (!known.has(key)) return { ok: false, message: `Unknown config field: ${key}` };
  }
  const value: Record<string, unknown> = {};
  for (const field of schema.configFields) {
    const raw = config[field.key];
    if (raw === undefined) {
      if (field.required && field.kind !== "boolean") {
        return { ok: false, message: requiredMessage(field) };
      }
      continue;
    }
    if (field.kind === "boolean") {
      if (typeof raw !== "boolean") return { ok: false, message: `${field.key} must be a boolean` };
      value[field.key] = raw;
      continue;
    }
    if (field.kind === "list") {
      const list = asStringList(raw);
      if (!list.ok) return { ok: false, message: `${field.key} must be a list of strings` };
      if (list.value.length === 0) {
        if (field.listMin) return { ok: false, message: "At least one URL is required" };
        continue;
      }
      if (field.listMax && list.value.length > field.listMax) {
        return { ok: false, message: "At most 50 URLs per connector" };
      }
      if (field.key === "urls") {
        for (const item of list.value) {
          try {
            const parsed = new URL(item);
            if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
              return { ok: false, message: `Invalid URL: ${item}` };
            }
          } catch {
            return { ok: false, message: `Invalid URL: ${item}` };
          }
        }
      }
      value[field.key] = list.value;
      continue;
    }
    if (typeof raw !== "string") return { ok: false, message: `${field.key} must be a string` };
    if (isSharedIdentity(field)) {
      const normalized = applyNormalize(field.normalize, raw);
      if (normalized.empty) return { ok: false, message: requiredMessage(field) };
      if (
        !normalized.ok ||
        normalized.value.length > field.maxLength ||
        !new RegExp(field.pattern).test(normalized.value)
      ) {
        return {
          ok: false,
          message:
            normalized.ok && normalized.value.length > field.maxLength
              ? `${field.key} is too long`
              : field.patternMessage,
        };
      }
      value[field.key] = normalized.value;
      continue;
    }
    if (field.normalize) {
      const normalized = applyNormalize(field.normalize, raw);
      if (normalized.empty) continue;
      if (!normalized.ok || (field.pattern && !new RegExp(field.pattern).test(normalized.value))) {
        return { ok: false, message: field.patternMessage ?? `${field.key} is invalid` };
      }
      value[field.key] = normalized.value;
      continue;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      if (field.required) return { ok: false, message: requiredMessage(field) };
      continue;
    }
    if (field.enumValues && !field.enumValues.includes(trimmed)) {
      return { ok: false, message: `${field.key} must be '${field.enumValues.join("' or '")}'` };
    }
    value[field.key] = trimmed;
  }
  if (type === "google_ads" && !configString(value, "clientId")) {
    return { ok: false, message: "clientId is required" };
  }
  return { ok: true, value };
}

export function connectorIdentityPrefill(
  type: MarketingConnectorType,
  identifiers: Record<string, string> | null | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of CONNECTOR_SCHEMAS[type].configFields) {
    if (!isSharedIdentity(field) || !field.connectorConfigKey) continue;
    const raw = identifiers?.[field.key];
    if (typeof raw !== "string") continue;
    const normalized = applyNormalize(field.normalize, raw);
    if (!normalized.ok || normalized.empty) continue;
    if (!new RegExp(field.pattern).test(normalized.value)) continue;
    out[field.connectorConfigKey] = normalized.value;
  }
  return out;
}

export function connectorIdentityDiffers(
  type: MarketingConnectorType,
  config: Record<string, unknown>,
  identifiers: Record<string, string> | null | undefined
): boolean {
  const fromAsset = connectorIdentityPrefill(type, identifiers);
  for (const field of CONNECTOR_SCHEMAS[type].configFields) {
    if (!isSharedIdentity(field) || !field.connectorConfigKey) continue;
    const assetValue = fromAsset[field.connectorConfigKey] ?? "";
    const raw = config[field.connectorConfigKey];
    const normalized =
      typeof raw === "string" ? applyNormalize(field.normalize, raw) : { empty: true as const };
    const configValue = "value" in normalized && normalized.ok ? normalized.value : "";
    if ((assetValue || configValue) && assetValue !== configValue) return true;
  }
  return false;
}

export function canonicalAccountId(
  type: MarketingConnectorType,
  config: Record<string, unknown>
): string {
  for (const field of CONNECTOR_SCHEMAS[type].configFields) {
    if (!isSharedIdentity(field) || !field.accountId) continue;
    const raw = config[field.key];
    if (typeof raw !== "string") return "";
    const normalized = applyNormalize(field.normalize, raw);
    return normalized.ok ? normalized.value : "";
  }
  return "";
}

export function assetDisplayIdentifier(
  type: MarketingAssetType,
  identifiers: Record<string, string> | null | undefined,
  publicUrl: string | null | undefined
): string | null {
  const values = identifiers ?? {};
  const fields = ASSET_IDENTIFIER_SCHEMAS[type].fields;
  const account = fields.find((field) => field.accountId && values[field.key]);
  if (account) return values[account.key] ?? null;
  const required = fields.find((field) => field.required && values[field.key]);
  if (required) return values[required.key] ?? null;
  const first = fields.find((field) => values[field.key]);
  if (first) return values[first.key] ?? null;
  if (type === "landing_page" && publicUrl) return publicUrl;
  return null;
}

export interface LegacyAssetMapping {
  identifiers: Record<string, string>;
  publicUrl: string | null;
  notes: string | null;
  unmapped: string[];
  notesTruncated: boolean;
}

export function mapLegacyAssetIdentifiers(input: {
  type: string;
  externalId: string | null;
  measurementIds: string[] | null;
  publicUrl: string | null;
  notes: string | null;
}): LegacyAssetMapping {
  const external = input.externalId?.trim() ?? "";
  const measurements = (input.measurementIds ?? []).map((item) => item.trim()).filter(Boolean);
  const tokens = [...(external ? [external] : []), ...measurements];
  const consumed = new Set<number>();
  const identifiers: Record<string, string> = {};
  let publicUrl = input.publicUrl;

  const take = (index: number) => consumed.add(index);

  if (input.type === "ga4") {
    const props = tokens.flatMap((token, index) => {
      const canonical = canonicalGa4Property(token);
      return canonical ? [{ index, token, canonical }] : [];
    });
    const measures = tokens.flatMap((token, index) => {
      const canonical = canonicalMeasurement(token);
      return canonical ? [{ index, canonical }] : [];
    });
    const chosenProp = props.find((item) => item.token === external) ?? props[0];
    if (chosenProp) {
      identifiers.propertyId = chosenProp.canonical;
      for (const item of props) if (item.canonical === chosenProp.canonical) take(item.index);
    }
    const chosenMeasure = measures[0];
    if (chosenMeasure) {
      identifiers.measurementId = chosenMeasure.canonical;
      for (const item of measures) if (item.canonical === chosenMeasure.canonical) take(item.index);
    }
  } else if (input.type === "meta_ads") {
    const candidates = tokens.flatMap((token, index) => {
      const canonical = canonicalMetaAccount(token);
      return canonical
        ? [{ index, canonical, fromExternal: token === external && index === 0 }]
        : [];
    });
    const groups = new Map<string, number[]>();
    for (const item of candidates) {
      const list = groups.get(item.canonical) ?? [];
      list.push(item.index);
      groups.set(item.canonical, list);
    }
    const externalGroup = external ? canonicalMetaAccount(external) : null;
    const distinct = [...groups.keys()];
    const onlyAccount = distinct.length === 1 ? distinct[0] : undefined;
    if (onlyAccount) {
      identifiers.adAccountId = onlyAccount;
      for (const index of groups.get(onlyAccount) ?? []) take(index);
    } else if (externalGroup && distinct.includes(externalGroup)) {
      const others = distinct.filter((item) => item !== externalGroup);
      identifiers.adAccountId = externalGroup;
      for (const index of groups.get(externalGroup) ?? []) take(index);
      const onlyPixel = others.length === 1 ? others[0] : undefined;
      if (onlyPixel) {
        identifiers.pixelId = onlyPixel;
        for (const index of groups.get(onlyPixel) ?? []) take(index);
      }
    }
  } else if (input.type === "google_ads") {
    const matches = tokens.flatMap((token, index) => {
      const canonical = canonicalGoogleCustomer(token);
      return canonical ? [{ index, canonical }] : [];
    });
    const chosen = matches[0];
    if (chosen) {
      identifiers.customerId = chosen.canonical;
      for (const item of matches) if (item.canonical === chosen.canonical) take(item.index);
    }
  } else if (input.type === "gtm") {
    const matches = tokens.flatMap((token, index) => {
      const canonical = canonicalContainer(token);
      return canonical ? [{ index, token, canonical }] : [];
    });
    const chosen = matches.find((item) => item.token === external) ?? matches[0];
    if (chosen) {
      identifiers.containerId = chosen.canonical;
      for (const item of matches) if (item.canonical === chosen.canonical) take(item.index);
    }
  } else if (input.type === "landing_page") {
    if (
      !input.publicUrl &&
      external &&
      /^https?:\/\//i.test(external) &&
      !/\s/.test(input.externalId ?? "")
    ) {
      try {
        const parsed = new URL(external);
        if (!parsed.username && !parsed.password) {
          publicUrl = external;
          take(0);
        }
      } catch {
        // Leave the token unmapped.
      }
    }
  } else if (input.type === "domain") {
    const matches = tokens.flatMap((token, index) => {
      const host = normalizeHostname(token);
      return host.ok ? [{ index, canonical: host.value }] : [];
    });
    const chosen = matches[0];
    if (chosen) {
      identifiers.hostname = chosen.canonical;
      for (const item of matches) if (item.canonical === chosen.canonical) take(item.index);
    }
  } else if (input.type === "other") {
    if (external && external.length <= 200 && !CREDENTIAL.test(external)) {
      identifiers.label = external;
      take(0);
    }
  }

  const unmapped = tokens.filter((_, index) => !consumed.has(index));
  const notes = appendLegacyNotes(input.notes, unmapped);
  return {
    identifiers,
    publicUrl,
    notes: notes.notes,
    unmapped,
    notesTruncated: notes.truncated,
  };
}

export function isTruncatedLegacyAppendix(notes: string | null | undefined): boolean {
  return Boolean(
    notes && notes.length === 5000 && notes.includes("[legacy-identifiers]") && notes.endsWith("…")
  );
}

function appendLegacyNotes(
  notes: string | null,
  unmapped: string[]
): { notes: string | null; truncated: boolean } {
  if (unmapped.length === 0) return { notes, truncated: false };
  if (notes?.includes("[legacy-identifiers]")) return { notes, truncated: false };
  const base = notes ?? "";
  const prefix = base.length > 0 ? `${base}\n` : "";
  const appendix = `[legacy-identifiers] ${unmapped.join(" | ")}`;
  const room = 5000 - prefix.length;
  if (room <= 1) return { notes: base.slice(0, 5000), truncated: true };
  if (appendix.length <= room) return { notes: `${prefix}${appendix}`, truncated: false };
  const clipped = appendix.slice(0, room - 1);
  return { notes: `${prefix}${clipped}…`, truncated: true };
}

function canonicalGa4Property(token: string): string | null {
  const match = /^(?:properties\/)?(\d{1,200})$/.exec(token);
  return match?.[1] ?? null;
}

function canonicalMeasurement(token: string): string | null {
  if (token.length > 200) return null;
  const upper = token.toUpperCase();
  return /^G-[A-Z0-9]+$/.test(upper) ? upper : null;
}

function canonicalMetaAccount(token: string): string | null {
  const match = /^(?:act_)?(\d{1,200})$/.exec(token);
  return match?.[1] ?? null;
}

function canonicalGoogleCustomer(token: string): string | null {
  const stripped = token.replace(/^customers\//, "").replace(/-/g, "");
  return /^\d{10}$/.test(stripped) ? stripped : null;
}

function canonicalContainer(token: string): string | null {
  if (token.length > 200) return null;
  const upper = token.toUpperCase();
  return /^GTM-[A-Z0-9]+$/.test(upper) ? upper : null;
}

function extractAuthorityHost(raw: string): string {
  let value = raw.trim();
  const scheme = value.indexOf("://");
  if (scheme >= 0) value = value.slice(scheme + 3);
  else if (value.startsWith("//")) value = value.slice(2);
  const cut = value.search(/[/?#]/);
  if (cut >= 0) value = value.slice(0, cut);
  const at = value.lastIndexOf("@");
  if (at >= 0) value = value.slice(at + 1);
  return value;
}

type Applied =
  | { empty: true; ok?: false; value?: undefined }
  | { ok: true; empty?: false; value: string }
  | { ok: false; empty?: false; value?: undefined };

function applyNormalize(kind: IdentifierNormalize, raw: string): Applied {
  const trimmed = raw.trim();
  if (!trimmed) return { empty: true };
  if (kind === "trim") return { ok: true, value: trimmed };
  if (kind === "trim_upper") return { ok: true, value: trimmed.toUpperCase() };
  if (kind === "digits")
    return /^\d+$/.test(trimmed) ? { ok: true, value: trimmed } : { ok: false };
  if (kind === "ga4_property") {
    const stripped = trimmed.replace(/^properties\//, "");
    return /^\d+$/.test(stripped) ? { ok: true, value: stripped } : { ok: false };
  }
  if (kind === "meta_ad_account") {
    const stripped = trimmed.replace(/^act_/, "");
    return /^\d+$/.test(stripped) ? { ok: true, value: stripped } : { ok: false };
  }
  const stripped = trimmed.replace(/^customers\//, "").replace(/-/g, "");
  if (!stripped) return { empty: true };
  return /^\d+$/.test(stripped) ? { ok: true, value: stripped } : { ok: false };
}

function isSharedIdentity(field: ConnectorConfigField): field is SharedIdentityField {
  return "maxLength" in field;
}

function projectField(field: ConnectorConfigField): ConnectorFieldSpec {
  return {
    key: field.key,
    kind: field.kind,
    required: field.required,
    ...(field.placeholder ? { placeholder: field.placeholder } : {}),
  };
}

function requiredMessage(field: ConnectorConfigField): string {
  if (isSharedIdentity(field)) return field.patternMessage;
  if (field.key === "clientId") return "clientId is required";
  if (field.key === "urls") return "At least one URL is required";
  return `${field.key} is required`;
}

function configString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  return typeof value === "string" ? value.trim() : "";
}

function digitsOnly(value: string): string {
  return value.replace(/-/g, "").trim();
}

function configList(config: Record<string, unknown>, key: string): string[] {
  const value = config[key];
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string")
    return value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  return [];
}

function asStringList(value: unknown): { ok: true; value: string[] } | { ok: false } {
  if (Array.isArray(value)) {
    if (value.some((item) => typeof item !== "string")) return { ok: false };
    return { ok: true, value: value.map((item) => item.trim()).filter(Boolean) };
  }
  if (typeof value === "string") {
    return {
      ok: true,
      value: value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    };
  }
  return { ok: false };
}
