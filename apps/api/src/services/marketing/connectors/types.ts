import type {
  MarketingConnectorFieldSpec,
  MarketingConnectorType,
} from "@echolore/shared/contracts";
import { isValidTimezone } from "../marketing-dates.js";

/** One base-metric value for one day and one dimension combination. */
export interface ConnectorMetricRow {
  date: string;
  accountId?: string;
  campaignId?: string;
  campaignName?: string | null;
  segment?: string;
  metric: string;
  value: number;
  currency?: string | null;
}

export interface ConnectorContext {
  /** Non-secret configuration (stored as JSON, visible to operators). */
  config: Record<string, unknown>;
  /** Decrypted secrets. Server-side only — never logged or returned. */
  secrets: Record<string, string>;
  timezone: string;
  currency: string | null;
}

export interface ConnectorFetchContext extends ConnectorContext {
  /** Inclusive YYYY-MM-DD */
  from: string;
  /** Inclusive YYYY-MM-DD */
  to: string;
}

export interface ConnectorFetchResult {
  rows: ConnectorMetricRow[];
  /** Informational notes stored with the run. */
  warnings: string[];
  /**
   * Operational problems that need a human now (LP停止・フォーム不通 etc.).
   * The run is marked partial and asset owners are notified.
   */
  alerts?: string[];
}

export interface AccountLocale {
  timezone: string;
  currency: string;
}

/** Accepts the timezone and currency an ad account or GA4 property reports. */
export function accountLocaleFromSource(
  timezone: string | undefined,
  currency: string | undefined
): AccountLocale {
  const zone = timezone?.trim() ?? "";
  if (!zone || !isValidTimezone(zone)) {
    throw new ConnectorError("Account did not return a valid timezone");
  }
  const code = currency?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new ConnectorError("Account did not return a valid currency");
  }
  return { timezone: zone, currency: code };
}

export interface ConnectorTestResult {
  ok: boolean;
  message: string;
  timezone?: string;
  currency?: string;
}

/**
 * A data source plugged into the marketing data pipeline. Adding a new
 * source means implementing this interface and registering it; storage,
 * quality checks, coverage, scheduling and dashboards are shared.
 */
export interface MarketingConnectorDefinition {
  type: MarketingConnectorType;
  configFields: MarketingConnectorFieldSpec[];
  secretFields: MarketingConnectorFieldSpec[];
  /** Whether the scheduler fetches from an API. CSV-only sources set false. */
  supportsSync: boolean;
  /** Base metrics this connector produces. */
  metrics: string[];
  /**
   * replace: rows for the fetched date range replace what was stored (daily
   *   re-fetch of the lookback window absorbs late conversions).
   * accumulate: values are added to the stored day (periodic health checks).
   */
  writeMode: "replace" | "accumulate";
  /** Date range for a scheduled run. Defaults to [today - lookback, yesterday]. */
  resolveRange?: (today: string, lookbackDays: number) => { from: string; to: string };
  /** Returns an error message for invalid config, or null. */
  validateConfig?: (config: Record<string, unknown>) => string | null;
  /** Reads timezone and currency from the source account. Must not use ctx.timezone. */
  readAccountLocale?: (ctx: ConnectorContext) => Promise<AccountLocale>;
  fetch: (ctx: ConnectorFetchContext) => Promise<ConnectorFetchResult>;
  test: (ctx: ConnectorContext) => Promise<ConnectorTestResult>;
}

export class ConnectorError extends Error {
  constructor(
    message: string,
    readonly retryable = false
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}

export function configString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  return typeof value === "string" ? value.trim() : "";
}

export function configList(config: Record<string, unknown>, key: string): string[] {
  const value = config[key];
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[\n,]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

export function configBool(config: Record<string, unknown>, key: string): boolean {
  const value = config[key];
  return value === true || value === "true";
}

export function requireSecret(secrets: Record<string, string>, key: string): string {
  const value = secrets[key];
  if (!value) throw new ConnectorError(`Missing credential: ${key}`);
  return value;
}

export function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return Number.NaN;
}
