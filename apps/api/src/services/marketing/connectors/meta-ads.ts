import {
  canonicalAccountId,
  normalizeConnectorConfig,
  projectConnectorFields,
} from "@echolore/shared/contracts";
import { fetchJsonWithRetry } from "./http.js";
import {
  type ConnectorContext,
  type ConnectorMetricRow,
  configList,
  configString,
  type MarketingConnectorDefinition,
  requireSecret,
  toNumber,
} from "./types.js";

/**
 * Meta Marketing API (Insights). Daily campaign-level delivery, cost and
 * conversions. Uses a system-user access token held server-side.
 */

const DEFAULT_API_VERSION = "v23.0";
const DEFAULT_CONVERSION_ACTION_TYPES = ["offsite_conversion.fb_pixel_lead", "lead"];
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

interface MetaAction {
  action_type: string;
  value: string;
}

interface MetaInsightRow {
  account_id?: string;
  account_currency?: string;
  campaign_id?: string;
  campaign_name?: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
}

interface MetaInsightsResponse {
  data: MetaInsightRow[];
  paging?: { next?: string };
}

function normalizeAccountId(raw: string): string {
  return raw.replace(/^act_/, "").trim();
}

function apiBase(config: Record<string, unknown>): string {
  const version = configString(config, "apiVersion") || DEFAULT_API_VERSION;
  return `https://graph.facebook.com/${encodeURIComponent(version)}`;
}

const metaRetryOptions = {
  isRetryableBody: (_status: number, body: unknown) => {
    const code = (body as { error?: { code?: number } } | null)?.error?.code;
    return (
      typeof code === "number" && (RATE_LIMIT_CODES.has(code) || (code >= 80000 && code <= 80014))
    );
  },
  describeError: (status: number, body: unknown) => {
    const err = (body as { error?: { message?: string; code?: number } } | null)?.error;
    return err?.message
      ? `Meta API ${status} (code ${err.code ?? "?"}): ${err.message}`
      : `Meta API ${status}`;
  },
};

function sumActions(actions: MetaAction[] | undefined, types: Set<string>): number | null {
  if (!actions) return null;
  let total = 0;
  let matched = false;
  for (const action of actions) {
    if (types.has(action.action_type)) {
      total += toNumber(action.value) || 0;
      matched = true;
    }
  }
  return matched ? total : 0;
}

export function mapMetaInsightRows(
  data: MetaInsightRow[],
  options: { conversionActionTypes: string[]; clickType: string; currencyOverride: string | null }
): ConnectorMetricRow[] {
  const types = new Set(options.conversionActionTypes);
  const rows: ConnectorMetricRow[] = [];
  for (const item of data) {
    const base = {
      date: item.date_start,
      accountId: item.account_id ?? "",
      campaignId: item.campaign_id ?? "",
      campaignName: item.campaign_name ?? null,
      currency: options.currencyOverride ?? item.account_currency ?? null,
    };
    const clicks = options.clickType === "all" ? item.clicks : item.inline_link_clicks;
    const values: Array<[string, number | null]> = [
      ["cost", toNumber(item.spend)],
      ["impressions", toNumber(item.impressions)],
      ["clicks", toNumber(clicks ?? "0")],
      ["conversions", sumActions(item.actions, types) ?? 0],
      ["conversion_value", sumActions(item.action_values, types) ?? 0],
    ];
    for (const [metric, value] of values) {
      if (value === null || !Number.isFinite(value)) continue;
      rows.push({ ...base, metric, value });
    }
  }
  return rows;
}

async function getAccountInfo(ctx: ConnectorContext) {
  const token = requireSecret(ctx.secrets, "accessToken");
  const accountId = normalizeAccountId(configString(ctx.config, "adAccountId"));
  const url = `${apiBase(ctx.config)}/act_${encodeURIComponent(accountId)}?fields=name,currency,timezone_name`;
  return fetchJsonWithRetry<{ name?: string; currency?: string; timezone_name?: string }>(
    url,
    { headers: { Authorization: `Bearer ${token}` } },
    { ...metaRetryOptions, retries: 1 }
  );
}

export const metaAdsConnector: MarketingConnectorDefinition = {
  type: "meta_ads",
  supportsSync: true,
  writeMode: "replace",
  metrics: ["cost", "impressions", "clicks", "conversions", "conversion_value"],
  ...projectConnectorFields("meta_ads"),
  validateConfig: (config) => {
    const result = normalizeConnectorConfig("meta_ads", config);
    return result.ok ? null : result.message;
  },
  async fetch(ctx) {
    const token = requireSecret(ctx.secrets, "accessToken");
    const accountId = normalizeAccountId(configString(ctx.config, "adAccountId"));
    const conversionActionTypes = configList(ctx.config, "conversionActionTypes");
    const params = new URLSearchParams({
      level: "campaign",
      time_increment: "1",
      time_range: JSON.stringify({ since: ctx.from, until: ctx.to }),
      fields:
        "account_id,account_currency,campaign_id,campaign_name,spend,impressions,clicks,inline_link_clicks,actions,action_values",
      use_unified_attribution_setting: "true",
      limit: "500",
    });
    let url: string | undefined =
      `${apiBase(ctx.config)}/act_${encodeURIComponent(accountId)}/insights?${params.toString()}`;
    const data: MetaInsightRow[] = [];
    let pages = 0;
    while (url && pages < 200) {
      const page: MetaInsightsResponse = await fetchJsonWithRetry<MetaInsightsResponse>(
        url,
        { headers: { Authorization: `Bearer ${token}` } },
        metaRetryOptions
      );
      data.push(...(page.data ?? []));
      url = page.paging?.next;
      pages++;
    }
    const warnings: string[] = [];
    if (pages >= 200) warnings.push("Pagination limit reached; results may be truncated");
    const mapped = mapMetaInsightRows(data, {
      conversionActionTypes:
        conversionActionTypes.length > 0 ? conversionActionTypes : DEFAULT_CONVERSION_ACTION_TYPES,
      clickType: configString(ctx.config, "clickType") || "link",
      currencyOverride: ctx.currency,
    });
    const canonical = canonicalAccountId("meta_ads", ctx.config);
    let differs = false;
    const rows = mapped.map((row) => {
      const fromApi = row.accountId ?? "";
      if (fromApi !== "") {
        if (canonical && fromApi !== canonical) differs = true;
        return row;
      }
      return { ...row, accountId: canonical };
    });
    if (differs) warnings.push("account id from API differs from connector config");
    return { rows, warnings };
  },
  async test(ctx) {
    const info = await getAccountInfo(ctx);
    return {
      ok: true,
      message: `Connected: ${info.name ?? "ad account"} (${info.currency ?? "?"}, ${info.timezone_name ?? "?"})`,
    };
  },
};
