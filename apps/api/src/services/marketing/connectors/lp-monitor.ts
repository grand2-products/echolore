import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { normalizeConnectorConfig, projectConnectorFields } from "@echolore/shared/contracts";
import { todayInTimezone } from "../marketing-dates.js";
import {
  ConnectorError,
  type ConnectorMetricRow,
  configBool,
  configList,
  type MarketingConnectorDefinition,
} from "./types.js";

/**
 * Landing-page health check (稼働・フォーム・計測の点検). Each run requests
 * every URL once and adds the result to today's counters, so availability
 * and average response time are derived from sums.
 */

const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return (
    v6 === "::1" ||
    v6 === "::" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe80")
  );
}

/**
 * Blocks requests to loopback / private / link-local hosts so the monitor
 * cannot be used to probe internal services (SSRF). Self-hosters that
 * monitor intranet pages can opt out with MARKETING_ALLOW_PRIVATE_URLS=true.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConnectorError(`Invalid URL: ${raw}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ConnectorError(`Unsupported protocol: ${url.protocol}`);
  }
  if (process.env.MARKETING_ALLOW_PRIVATE_URLS === "true") return url;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new ConnectorError(`Refusing to request a private or local address: ${url.hostname}`);
  }
  return url;
}

export interface PageCheckResult {
  url: string;
  ok: boolean;
  status: number | null;
  responseMs: number;
  problems: string[];
}

async function readLimited(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BODY_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function checkPage(
  rawUrl: string,
  expectations: { expectedTags: string[]; requireForm: boolean }
): Promise<PageCheckResult> {
  const started = Date.now();
  const problems: string[] = [];
  let status: number | null = null;
  try {
    let current = rawUrl;
    let response: Response | null = null;
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      const url = await assertPublicUrl(current);
      response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "EchoLore-LP-Monitor/1.0" },
      });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        current = new URL(location, url).toString();
        continue;
      }
      break;
    }
    if (!response) throw new ConnectorError("No response");
    status = response.status;
    if (status < 200 || status >= 300) {
      problems.push(`HTTP ${status}`);
    } else {
      const html = await readLimited(response);
      for (const tag of expectations.expectedTags) {
        if (!html.includes(tag)) problems.push(`Tag not found: ${tag}`);
      }
      if (expectations.requireForm && !/<form[\s>]/i.test(html)) problems.push("Form not found");
    }
  } catch (err) {
    problems.push(err instanceof Error ? err.message : "Request failed");
  }
  return {
    url: rawUrl,
    ok: problems.length === 0,
    status,
    responseMs: Date.now() - started,
    problems,
  };
}

export const lpMonitorConnector: MarketingConnectorDefinition = {
  type: "lp_monitor",
  supportsSync: true,
  writeMode: "accumulate",
  metrics: ["uptime_checks", "uptime_successes", "response_ms_total"],
  ...projectConnectorFields("lp_monitor"),
  // A health check observes "now", so a run always covers today only.
  resolveRange: (today) => ({ from: today, to: today }),
  validateConfig: (config) => {
    const result = normalizeConnectorConfig("lp_monitor", config);
    return result.ok ? null : result.message;
  },
  async fetch(ctx) {
    const date = todayInTimezone(ctx.timezone);
    const expectations = {
      expectedTags: configList(ctx.config, "expectedTags"),
      requireForm: configBool(ctx.config, "requireForm"),
    };
    const rows: ConnectorMetricRow[] = [];
    const alerts: string[] = [];
    for (const url of configList(ctx.config, "urls")) {
      const result = await checkPage(url, expectations);
      rows.push(
        { date, segment: url, metric: "uptime_checks", value: 1 },
        { date, segment: url, metric: "uptime_successes", value: result.ok ? 1 : 0 },
        { date, segment: url, metric: "response_ms_total", value: result.responseMs }
      );
      if (!result.ok) alerts.push(`${url}: ${result.problems.join("; ")}`);
    }
    return { rows, warnings: [], alerts };
  },
  async test(ctx) {
    const urls = configList(ctx.config, "urls");
    const first = urls[0];
    if (!first) return { ok: false, message: "No URL configured" };
    const result = await checkPage(first, {
      expectedTags: configList(ctx.config, "expectedTags"),
      requireForm: configBool(ctx.config, "requireForm"),
    });
    return result.ok
      ? { ok: true, message: `OK: ${first} (${result.status}, ${result.responseMs}ms)` }
      : { ok: false, message: `${first}: ${result.problems.join("; ")}` };
  },
};
