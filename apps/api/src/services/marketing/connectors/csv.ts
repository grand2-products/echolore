import { MARKETING_BASE_METRIC_KEYS, projectConnectorFields } from "@echolore/shared/contracts";
import { normalizeDate } from "../marketing-dates.js";
import type { ConnectorMetricRow, MarketingConnectorDefinition } from "./types.js";

/**
 * CSV import. Used as a standalone source (受注・問い合わせ等) and as the
 * fallback for API connectors while API access is pending: the media
 * owner's export is imported with the same metric definitions.
 *
 * Format: header row, `date` column required, optional `account_id`,
 * `campaign_id`, `campaign_name`, `segment`, plus base metric columns
 * (cost, impressions, clicks, ...). Unknown columns are rejected. Empty
 * cells are skipped (not treated as zero).
 */

export const CSV_MAX_BYTES = 5 * 1024 * 1024;
export const CSV_MAX_ROWS = 200_000;

const DIMENSION_COLUMNS = new Set([
  "date",
  "account_id",
  "campaign_id",
  "campaign_name",
  "segment",
]);
const METRIC_COLUMNS = new Set(MARKETING_BASE_METRIC_KEYS);

export class CsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvFormatError";
  }
}

/** RFC 4180 parser (quoted fields, escaped quotes, CRLF/LF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      if (rows.length > CSV_MAX_ROWS + 1)
        throw new CsvFormatError(`Too many rows (max ${CSV_MAX_ROWS})`);
    } else {
      field += ch;
    }
  }
  if (inQuotes) throw new CsvFormatError("Unterminated quoted field");
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export interface CsvParseResult {
  rows: ConnectorMetricRow[];
  invalidRows: number;
  minDate: string | null;
  maxDate: string | null;
  errors: string[];
}

export function csvToMetricRows(text: string, currency: string | null): CsvParseResult {
  const table = parseCsv(text);
  const header = table[0]?.map((h) => h.trim().toLowerCase());
  if (!header || header.length === 0) throw new CsvFormatError("CSV is empty");
  if (!header.includes("date")) throw new CsvFormatError("Missing required column: date");

  const unknown = header.filter((h) => !DIMENSION_COLUMNS.has(h) && !METRIC_COLUMNS.has(h));
  if (unknown.length > 0) {
    throw new CsvFormatError(
      `Unknown columns: ${unknown.join(", ")}. Allowed metrics: ${[...METRIC_COLUMNS].join(", ")}`
    );
  }
  const metricCols = header.map((h, i) => ({ h, i })).filter(({ h }) => METRIC_COLUMNS.has(h));
  if (metricCols.length === 0) throw new CsvFormatError("No metric columns found");

  const col = (name: string) => header.indexOf(name);
  const idx = {
    date: col("date"),
    account: col("account_id"),
    campaign: col("campaign_id"),
    campaignName: col("campaign_name"),
    segment: col("segment"),
  };
  const get = (cells: string[], i: number) => (i >= 0 ? (cells[i] ?? "").trim() : "");

  const rows: ConnectorMetricRow[] = [];
  const errors: string[] = [];
  let invalidRows = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (let r = 1; r < table.length; r++) {
    const cells = table[r] ?? [];
    const date = normalizeDate(get(cells, idx.date));
    if (!date) {
      invalidRows++;
      if (errors.length < 20) errors.push(`Row ${r + 1}: invalid date "${get(cells, idx.date)}"`);
      continue;
    }
    if (!minDate || date < minDate) minDate = date;
    if (!maxDate || date > maxDate) maxDate = date;
    let rowValid = true;
    const pending: ConnectorMetricRow[] = [];
    for (const { h, i } of metricCols) {
      const raw = get(cells, i).replace(/[,¥$€£\s]/g, "");
      if (raw === "") continue;
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        rowValid = false;
        if (errors.length < 20)
          errors.push(`Row ${r + 1}: ${h} is not a number "${get(cells, i)}"`);
        break;
      }
      pending.push({
        date,
        accountId: get(cells, idx.account),
        campaignId: get(cells, idx.campaign),
        campaignName: get(cells, idx.campaignName) || null,
        segment: get(cells, idx.segment),
        metric: h,
        value,
        currency,
      });
    }
    if (!rowValid) {
      invalidRows++;
      continue;
    }
    rows.push(...pending);
  }
  return { rows, invalidRows, minDate, maxDate, errors };
}

export const csvConnector: MarketingConnectorDefinition = {
  type: "csv",
  supportsSync: false,
  writeMode: "replace",
  metrics: MARKETING_BASE_METRIC_KEYS,
  ...projectConnectorFields("csv"),
  async fetch() {
    return { rows: [], warnings: ["CSV connectors receive data via import only"] };
  },
  async test() {
    return { ok: true, message: "CSV connector: import a file to load data" };
  },
};
