import {
  type CreateMarketingConnectorRequest,
  normalizeConnectorConfig,
} from "@echolore/shared/contracts";

export type SetupSource = "ga4" | "meta_ads" | "google_ads";

export type SetupIssue =
  | "measurement_id"
  | "property_id"
  | "json"
  | "ad_account"
  | "customer_id"
  | "required";

export interface SetupFields {
  propertyId: string;
  serviceAccountKeyJson: string;
  adAccountId: string;
  accessToken: string;
  customerId: string;
  clientId: string;
  developerToken: string;
  clientSecret: string;
  refreshToken: string;
}

export const emptySetupFields = (): SetupFields => ({
  propertyId: "",
  serviceAccountKeyJson: "",
  adAccountId: "",
  accessToken: "",
  customerId: "",
  clientId: "",
  developerToken: "",
  clientSecret: "",
  refreshToken: "",
});

function blank(value: string): boolean {
  return value.trim() === "";
}

function serviceAccountJson(raw: string): SetupIssue | null {
  const text = raw.trim();
  if (!text) return "required";
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "json";
  } catch {
    return "json";
  }
  return null;
}

/**
 * The minimum create body for a media connector. Timezone and currency are
 * omitted so the server reads them from the account.
 */
export function buildSetupRequest(
  source: SetupSource,
  fields: SetupFields
): { ok: true; body: CreateMarketingConnectorRequest } | { ok: false; issue: SetupIssue } {
  if (source === "ga4") {
    if (blank(fields.propertyId)) return { ok: false, issue: "required" };
    const raw = fields.propertyId.trim().replace(/^properties\//i, "");
    if (/^G-/i.test(raw)) return { ok: false, issue: "measurement_id" };
    const normalized = normalizeConnectorConfig("ga4", { propertyId: fields.propertyId });
    if (!normalized.ok) return { ok: false, issue: "property_id" };
    const jsonIssue = serviceAccountJson(fields.serviceAccountKeyJson);
    if (jsonIssue) return { ok: false, issue: jsonIssue };
    const propertyId = String(normalized.value.propertyId);
    return {
      ok: true,
      body: {
        name: `GA4 ${propertyId}`,
        type: "ga4",
        config: { propertyId },
        secrets: { serviceAccountKeyJson: fields.serviceAccountKeyJson.trim() },
        enabled: true,
      },
    };
  }

  if (source === "meta_ads") {
    const normalized = normalizeConnectorConfig("meta_ads", { adAccountId: fields.adAccountId });
    if (!normalized.ok) return { ok: false, issue: "ad_account" };
    if (blank(fields.accessToken)) return { ok: false, issue: "required" };
    const adAccountId = String(normalized.value.adAccountId);
    return {
      ok: true,
      body: {
        name: `Meta ${adAccountId}`,
        type: "meta_ads",
        config: { adAccountId },
        secrets: { accessToken: fields.accessToken.trim() },
        enabled: true,
      },
    };
  }

  if (
    blank(fields.customerId) ||
    blank(fields.clientId) ||
    blank(fields.developerToken) ||
    blank(fields.clientSecret) ||
    blank(fields.refreshToken)
  ) {
    return { ok: false, issue: "required" };
  }
  const normalized = normalizeConnectorConfig("google_ads", {
    customerId: fields.customerId,
    clientId: fields.clientId,
  });
  if (!normalized.ok) return { ok: false, issue: "customer_id" };
  const customerId = String(normalized.value.customerId);
  return {
    ok: true,
    body: {
      name: `Google Ads ${customerId}`,
      type: "google_ads",
      config: { customerId, clientId: fields.clientId.trim() },
      secrets: {
        developerToken: fields.developerToken.trim(),
        clientSecret: fields.clientSecret.trim(),
        refreshToken: fields.refreshToken.trim(),
      },
      enabled: true,
    },
  };
}
