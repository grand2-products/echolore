import { isSummableAcrossSources } from "@echolore/shared/contracts";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/index.js", () => ({ db: {} }));

import { CsvFormatError, csvToMetricRows, parseCsv } from "./connectors/csv.js";
import { mapGoogleAdsRows } from "./connectors/google-ads.js";
import { assertPublicUrl } from "./connectors/lp-monitor.js";
import { mapMetaInsightRows } from "./connectors/meta-ads.js";
import { addDays, nextBusinessDay, normalizeDate, todayInTimezone } from "./marketing-dates.js";
import { computeMetricValue, pivotFacts } from "./marketing-metrics-service.js";
import { mergeSecrets } from "./marketing-secrets.js";
import { normalizeConnectorRows } from "./marketing-sync-service.js";

describe("metric dictionary", () => {
  it("never sums media conversions across sources", () => {
    expect(isSummableAcrossSources("cost")).toBe(true);
    expect(isSummableAcrossSources("conversions")).toBe(false);
    expect(isSummableAcrossSources("cpa")).toBe(false);
    expect(isSummableAcrossSources("ctr")).toBe(true);
  });

  it("computes ratios from sums and returns null (算定不可) for zero denominators", () => {
    const sums = new Map([
      ["cost", 1000],
      ["clicks", 50],
      ["impressions", 0],
      ["conversions", 4],
    ]);
    expect(computeMetricValue("cpc", sums)).toBe(20);
    expect(computeMetricValue("cpa", sums)).toBe(250);
    expect(computeMetricValue("ctr", sums)).toBeNull();
    expect(computeMetricValue("cvr", sums)).toBeNull();
    expect(computeMetricValue("sessions", sums)).toBeNull();
  });

  it("pivots facts into rows and keeps currencies apart when split", () => {
    const rows = pivotFacts(
      [
        {
          dims: { source: "meta_ads" },
          campaignName: null,
          currency: "JPY",
          metric: "cost",
          value: 1000,
        },
        {
          dims: { source: "meta_ads" },
          campaignName: null,
          currency: "USD",
          metric: "cost",
          value: 10,
        },
        {
          dims: { source: "meta_ads" },
          campaignName: null,
          currency: "JPY",
          metric: "clicks",
          value: 10,
        },
      ],
      ["cost", "cpc"],
      ["source"],
      true,
      null,
      new Map()
    );
    expect(rows).toHaveLength(2);
    const jpy = rows.find((r) => r.currency === "JPY");
    expect(jpy?.values).toEqual({ cost: 1000, cpc: 100 });
    const usd = rows.find((r) => r.currency === "USD");
    expect(usd?.values).toEqual({ cost: 10, cpc: null });
  });
});

describe("normalizeConnectorRows", () => {
  const opts = {
    connectorId: "c1",
    source: "meta_ads",
    from: "2026-10-01",
    to: "2026-10-03",
    mode: "replace" as const,
    allowedMetrics: ["cost", "clicks"],
  };

  it("drops invalid rows, counts duplicates and negatives, lists empty dates", () => {
    const { facts, quality } = normalizeConnectorRows(
      [
        { date: "2026-10-01", campaignId: "1", metric: "cost", value: 100 },
        { date: "2026-10-01", campaignId: "1", metric: "cost", value: 120 },
        { date: "2026-10-02", campaignId: "1", metric: "cost", value: -5 },
        { date: "2026-09-30", campaignId: "1", metric: "cost", value: 1 },
        { date: "2026-10-02", campaignId: "1", metric: "sessions", value: 1 },
        { date: "2026-10-02", campaignId: "1", metric: "ctr", value: 1 },
        { date: "2026-10-02", campaignId: "1", metric: "clicks", value: Number.NaN },
      ],
      opts
    );
    expect(facts).toHaveLength(2);
    expect(facts.find((f) => f.date === "2026-10-01")?.value).toBe(120);
    expect(quality).toMatchObject({
      duplicateKeys: 1,
      negativeValues: 1,
      invalidRows: 4,
      emptyDates: ["2026-10-03"],
    });
  });

  it("sums duplicates in accumulate mode", () => {
    const { facts, quality } = normalizeConnectorRows(
      [
        { date: "2026-10-01", segment: "https://a", metric: "clicks", value: 1 },
        { date: "2026-10-01", segment: "https://a", metric: "clicks", value: 1 },
      ],
      { ...opts, mode: "accumulate" }
    );
    expect(facts[0]?.value).toBe(2);
    expect(quality.duplicateKeys).toBe(0);
  });
});

describe("CSV import", () => {
  it("parses quoted fields, BOM and CRLF", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n')).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"'],
    ]);
  });

  it("maps columns to metric rows, skipping empty cells (not zero)", () => {
    const result = csvToMetricRows(
      'date,campaign_id,cost,clicks\n2026/10/01,c1,"1,200",\n2026-10-02,c1,300,5\nbad,c1,1,1\n',
      "JPY"
    );
    expect(result.rows).toEqual([
      expect.objectContaining({ date: "2026-10-01", metric: "cost", value: 1200, currency: "JPY" }),
      expect.objectContaining({ date: "2026-10-02", metric: "cost", value: 300 }),
      expect.objectContaining({ date: "2026-10-02", metric: "clicks", value: 5 }),
    ]);
    expect(result.invalidRows).toBe(1);
    expect(result.minDate).toBe("2026-10-01");
    expect(result.maxDate).toBe("2026-10-02");
  });

  it("rejects unknown columns so definitions stay aligned", () => {
    expect(() => csvToMetricRows("date,spend\n2026-10-01,1\n", null)).toThrow(CsvFormatError);
  });
});

describe("media mappers", () => {
  it("maps Meta insights with configured conversion actions", () => {
    const rows = mapMetaInsightRows(
      [
        {
          date_start: "2026-10-01",
          account_id: "1",
          account_currency: "JPY",
          campaign_id: "c1",
          campaign_name: "Spring",
          spend: "1000",
          impressions: "500",
          clicks: "30",
          inline_link_clicks: "20",
          actions: [
            { action_type: "lead", value: "2" },
            { action_type: "link_click", value: "20" },
          ],
          action_values: [{ action_type: "lead", value: "5000" }],
        },
      ],
      { conversionActionTypes: ["lead"], clickType: "link", currencyOverride: null }
    );
    const byMetric = Object.fromEntries(rows.map((r) => [r.metric, r.value]));
    expect(byMetric).toEqual({
      cost: 1000,
      impressions: 500,
      clicks: 20,
      conversions: 2,
      conversion_value: 5000,
    });
    expect(rows[0]).toMatchObject({ currency: "JPY", campaignName: "Spring" });
  });

  it("converts Google Ads cost micros", () => {
    const rows = mapGoogleAdsRows(
      [
        {
          segments: { date: "2026-10-01" },
          campaign: { id: "9", name: "Search" },
          customer: { id: "123", currencyCode: "JPY" },
          metrics: { costMicros: "2500000000", impressions: "10", clicks: "2", conversions: 1.5 },
        },
      ],
      null
    );
    expect(rows.find((r) => r.metric === "cost")?.value).toBe(2500);
    expect(rows.find((r) => r.metric === "conversions")?.value).toBe(1.5);
  });
});

describe("helpers", () => {
  it("handles dates", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(normalizeDate("20261005")).toBe("2026-10-05");
    expect(normalizeDate("2026/1/5")).toBe("2026-01-05");
    expect(normalizeDate("2026-02-30")).toBeNull();
    expect(todayInTimezone("Asia/Tokyo", new Date("2026-10-26T16:00:00Z"))).toBe("2026-10-27");
    expect(nextBusinessDay(new Date("2026-10-31T00:00:00Z")).toISOString()).toBe(
      "2026-11-02T00:00:00.000Z"
    );
  });

  it("merges write-only secrets", () => {
    expect(
      mergeSecrets({ accessToken: "old", stale: "x" }, { accessToken: "", other: "y" }, [
        "accessToken",
        "other",
      ])
    ).toEqual({ other: "y" });
    expect(mergeSecrets({ accessToken: "keep" }, undefined, ["accessToken"])).toEqual({
      accessToken: "keep",
    });
  });

  it("blocks private addresses for the LP monitor (SSRF)", async () => {
    await expect(assertPublicUrl("http://127.0.0.1/admin")).rejects.toThrow(/private/);
    await expect(assertPublicUrl("http://169.254.169.254/latest")).rejects.toThrow(/private/);
    await expect(assertPublicUrl("http://[::1]/")).rejects.toThrow(/private/);
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow(/protocol/);
    await expect(assertPublicUrl("https://93.184.216.34/")).resolves.toBeInstanceOf(URL);
  });
});
