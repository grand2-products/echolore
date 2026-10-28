import {
  canonicalAccountId,
  normalizeConnectorConfig,
  projectConnectorFields,
} from "@echolore/shared/contracts";
import { fetchJsonWithRetry } from "./http.js";
import {
  accountLocaleFromSource,
  type ConnectorContext,
  ConnectorError,
  type ConnectorMetricRow,
  configString,
  type MarketingConnectorDefinition,
  requireSecret,
  toNumber,
} from "./types.js";

/**
 * Google Ads API (REST searchStream). Daily campaign-level delivery, cost
 * and conversions. Authenticates with an OAuth refresh token + developer
 * token; an optional manager (MCC) ID is sent as login-customer-id.
 */

const DEFAULT_API_VERSION = "v23";

interface GoogleAdsRow {
  segments?: { date?: string };
  campaign?: { id?: string; name?: string };
  customer?: { id?: string; currencyCode?: string };
  metrics?: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    conversions?: number | string;
    conversionsValue?: number | string;
  };
}

type SearchStreamResponse = Array<{ results?: GoogleAdsRow[] }>;

const digitsOnly = (value: string) => value.replace(/-/g, "").trim();

const googleRetryOptions = {
  describeError: (status: number, body: unknown) => {
    const err = (body as { error?: { message?: string; status?: string } } | null)?.error;
    const first = Array.isArray(body)
      ? (body[0] as { error?: { message?: string } } | undefined)?.error
      : undefined;
    const message = err?.message ?? first?.message;
    return message ? `Google Ads API ${status}: ${message}` : `Google Ads API ${status}`;
  },
};

async function getAccessToken(ctx: ConnectorContext): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: configString(ctx.config, "clientId"),
    client_secret: requireSecret(ctx.secrets, "clientSecret"),
    refresh_token: requireSecret(ctx.secrets, "refreshToken"),
  });
  const token = await fetchJsonWithRetry<{ access_token?: string }>(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
    {
      retries: 2,
      describeError: (status, b) =>
        `OAuth token refresh failed (${status}): ${
          (b as { error_description?: string; error?: string } | null)?.error_description ??
          (b as { error?: string } | null)?.error ??
          "unknown"
        }`,
    }
  );
  if (!token.access_token) throw new ConnectorError("OAuth token refresh returned no access token");
  return token.access_token;
}

async function searchStream(ctx: ConnectorContext, query: string): Promise<GoogleAdsRow[]> {
  const accessToken = await getAccessToken(ctx);
  const customerId = digitsOnly(configString(ctx.config, "customerId"));
  const loginCustomerId = digitsOnly(configString(ctx.config, "loginCustomerId"));
  const version = configString(ctx.config, "apiVersion") || DEFAULT_API_VERSION;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": requireSecret(ctx.secrets, "developerToken"),
    "Content-Type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;

  const response = await fetchJsonWithRetry<SearchStreamResponse>(
    `https://googleads.googleapis.com/${encodeURIComponent(version)}/customers/${customerId}/googleAds:searchStream`,
    { method: "POST", headers, body: JSON.stringify({ query }) },
    googleRetryOptions
  );
  return (response ?? []).flatMap((batch) => batch.results ?? []);
}

async function readGoogleCustomer(ctx: ConnectorContext) {
  const results = await searchStream(
    ctx,
    "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1"
  );
  return results[0]?.customer as
    | { id?: string; descriptiveName?: string; currencyCode?: string; timeZone?: string }
    | undefined;
}

export function mapGoogleAdsRows(results: GoogleAdsRow[]): ConnectorMetricRow[] {
  const rows: ConnectorMetricRow[] = [];
  for (const r of results) {
    const date = r.segments?.date;
    if (!date) continue;
    const base = {
      date,
      accountId: r.customer?.id ?? "",
      campaignId: r.campaign?.id ?? "",
      campaignName: r.campaign?.name ?? null,
      currency: r.customer?.currencyCode ?? null,
    };
    const m = r.metrics ?? {};
    const values: Array<[string, number]> = [
      ["cost", toNumber(m.costMicros ?? "0") / 1_000_000],
      ["impressions", toNumber(m.impressions ?? "0")],
      ["clicks", toNumber(m.clicks ?? "0")],
      ["conversions", toNumber(m.conversions ?? 0)],
      ["conversion_value", toNumber(m.conversionsValue ?? 0)],
    ];
    for (const [metric, value] of values) {
      if (Number.isFinite(value)) rows.push({ ...base, metric, value });
    }
  }
  return rows;
}

export const googleAdsConnector: MarketingConnectorDefinition = {
  type: "google_ads",
  supportsSync: true,
  writeMode: "replace",
  metrics: ["cost", "impressions", "clicks", "conversions", "conversion_value"],
  ...projectConnectorFields("google_ads"),
  validateConfig: (config) => {
    const result = normalizeConnectorConfig("google_ads", config);
    return result.ok ? null : result.message;
  },
  readAccountLocale: async (ctx) => {
    const customer = await readGoogleCustomer(ctx);
    return accountLocaleFromSource(customer?.timeZone, customer?.currencyCode);
  },
  async fetch(ctx) {
    const query = [
      "SELECT segments.date, customer.id, customer.currency_code, campaign.id, campaign.name,",
      "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions,",
      "metrics.conversions_value",
      "FROM campaign",
      `WHERE segments.date BETWEEN '${ctx.from}' AND '${ctx.to}'`,
    ].join(" ");
    const results = await searchStream(ctx, query);
    const canonical = canonicalAccountId("google_ads", ctx.config);
    let differs = false;
    const rows = mapGoogleAdsRows(results).map((row) => {
      const fromApi = row.accountId ?? "";
      if (fromApi !== "") {
        if (canonical && fromApi !== canonical) differs = true;
        return row;
      }
      return { ...row, accountId: canonical };
    });
    return {
      rows,
      warnings: differs ? ["account id from API differs from connector config"] : [],
    };
  },
  async test(ctx) {
    const customer = await readGoogleCustomer(ctx);
    const locale = accountLocaleFromSource(customer?.timeZone, customer?.currencyCode);
    return {
      ok: true,
      message: `Connected: ${customer?.descriptiveName ?? customer?.id ?? "customer"} (${locale.currency}, ${locale.timezone})`,
      timezone: locale.timezone,
      currency: locale.currency,
    };
  },
};
