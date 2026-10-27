import { normalizeConnectorConfig, projectConnectorFields } from "@echolore/shared/contracts";
import { GoogleAuth } from "google-auth-library";
import { getGcpCredentials } from "../../admin/gcp-credentials-service.js";
import { normalizeDate } from "../marketing-dates.js";
import { fetchJsonWithRetry } from "./http.js";
import {
  type ConnectorContext,
  ConnectorError,
  type ConnectorMetricRow,
  configBool,
  configList,
  configString,
  type MarketingConnectorDefinition,
  toNumber,
} from "./types.js";

/**
 * GA4 Data API (runReport). Daily sessions, key events, LP views and form
 * events. Values are the Data API's aggregates, which can differ from the
 * GA4 UI and the BigQuery export (仕様上の差異 — documented, not "fixed").
 */

const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const PAGE_SIZE = 100_000;

interface RunReportResponse {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
  rowCount?: number;
}

type TokenProvider = (keyJson: string) => Promise<string>;

let tokenProvider: TokenProvider = async (keyJson) => {
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(keyJson);
  } catch {
    throw new ConnectorError("Service account key is not valid JSON");
  }
  const auth = new GoogleAuth({ credentials, scopes: [SCOPE] });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new ConnectorError("Failed to obtain GA4 access token");
  return token;
};

/** Test hook. */
export function _setGa4TokenProviderForTests(fn: TokenProvider) {
  tokenProvider = fn;
}

async function resolveKeyJson(ctx: ConnectorContext): Promise<string> {
  if (ctx.secrets.serviceAccountKeyJson) return ctx.secrets.serviceAccountKeyJson;
  if (configBool(ctx.config, "useGcpDefaults")) {
    const creds = await getGcpCredentials();
    if (creds.gcpServiceAccountKeyJson) return creds.gcpServiceAccountKeyJson;
  }
  throw new ConnectorError("Missing credential: serviceAccountKeyJson");
}

type Filter = Record<string, unknown>;

const inList = (fieldName: string, values: string[]): Filter => ({
  filter: { fieldName, inListFilter: { values } },
});

function andFilters(filters: Filter[]): Filter | undefined {
  if (filters.length === 0) return undefined;
  if (filters.length === 1) return filters[0];
  return { andGroup: { expressions: filters } };
}

async function runReport(
  ctx: ConnectorContext,
  token: string,
  body: Record<string, unknown>
): Promise<RunReportResponse["rows"]> {
  const propertyId = configString(ctx.config, "propertyId");
  const rows: NonNullable<RunReportResponse["rows"]> = [];
  for (let offset = 0; offset < 1_000_000; offset += PAGE_SIZE) {
    const res = await fetchJsonWithRetry<RunReportResponse>(
      `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, limit: PAGE_SIZE, offset }),
      },
      {
        describeError: (status, b) => {
          const message = (b as { error?: { message?: string } } | null)?.error?.message;
          return message ? `GA4 Data API ${status}: ${message}` : `GA4 Data API ${status}`;
        },
      }
    );
    rows.push(...(res.rows ?? []));
    if (!res.rowCount || offset + PAGE_SIZE >= res.rowCount) break;
  }
  return rows;
}

function cell(row: NonNullable<RunReportResponse["rows"]>[number], kind: "d" | "m", i: number) {
  const list = kind === "d" ? row.dimensionValues : row.metricValues;
  return list?.[i]?.value ?? "";
}

export const ga4Connector: MarketingConnectorDefinition = {
  type: "ga4",
  supportsSync: true,
  writeMode: "replace",
  metrics: ["sessions", "key_events", "lp_views", "form_starts", "form_submits"],
  ...projectConnectorFields("ga4"),
  validateConfig: (config) => {
    const result = normalizeConnectorConfig("ga4", config);
    return result.ok ? null : result.message;
  },
  async fetch(ctx) {
    const token = await tokenProvider(await resolveKeyJson(ctx));
    const propertyId = configString(ctx.config, "propertyId");
    const lpPaths = configList(ctx.config, "landingPagePaths");
    const startEvent = configString(ctx.config, "formStartEvent") || "form_start";
    const submitEvent = configString(ctx.config, "formSubmitEvent") || "form_submit";
    const dateRanges = [{ startDate: ctx.from, endDate: ctx.to }];
    const pathFilter = lpPaths.length > 0 ? [inList("pagePath", lpPaths)] : [];
    const out: ConnectorMetricRow[] = [];
    const warnings: string[] = [];
    const push = (date: string, segment: string, metric: string, raw: string) => {
      const normalized = normalizeDate(date);
      const value = toNumber(raw);
      if (!normalized || !Number.isFinite(value)) return;
      out.push({
        date: normalized,
        accountId: propertyId,
        segment,
        metric,
        value,
        currency: ctx.currency,
      });
    };

    // 1) Sessions and key events by landing page
    const sessionRows = await runReport(ctx, token, {
      dateRanges,
      dimensions: [{ name: "date" }, { name: "landingPage" }],
      metrics: [{ name: "sessions" }, { name: "keyEvents" }],
    });
    for (const row of sessionRows ?? []) {
      push(cell(row, "d", 0), cell(row, "d", 1), "sessions", cell(row, "m", 0));
      push(cell(row, "d", 0), cell(row, "d", 1), "key_events", cell(row, "m", 1));
    }

    // 2) LP views (LP到達) by page path
    const viewRows = await runReport(ctx, token, {
      dateRanges,
      dimensions: [{ name: "date" }, { name: "pagePath" }],
      metrics: [{ name: "screenPageViews" }],
      dimensionFilter: andFilters(pathFilter),
    });
    for (const row of viewRows ?? []) {
      push(cell(row, "d", 0), cell(row, "d", 1), "lp_views", cell(row, "m", 0));
    }

    // 3) Form start / submit events by page path
    const formRows = await runReport(ctx, token, {
      dateRanges,
      dimensions: [{ name: "date" }, { name: "eventName" }, { name: "pagePath" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: andFilters([inList("eventName", [startEvent, submitEvent]), ...pathFilter]),
    });
    for (const row of formRows ?? []) {
      const eventName = cell(row, "d", 1);
      const metric =
        eventName === startEvent
          ? "form_starts"
          : eventName === submitEvent
            ? "form_submits"
            : null;
      if (metric) push(cell(row, "d", 0), cell(row, "d", 2), metric, cell(row, "m", 0));
    }
    if (lpPaths.length === 0) {
      warnings.push("landingPagePaths not set: LP views and form events include every page");
    }
    return { rows: out, warnings };
  },
  async test(ctx) {
    const token = await tokenProvider(await resolveKeyJson(ctx));
    const propertyId = configString(ctx.config, "propertyId");
    const meta = await fetchJsonWithRetry<{ name?: string }>(
      `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}/metadata`,
      { headers: { Authorization: `Bearer ${token}` } },
      { retries: 1 }
    );
    return { ok: true, message: `Connected: ${meta.name ?? `properties/${propertyId}`}` };
  },
};
