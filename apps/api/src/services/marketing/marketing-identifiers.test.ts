import {
  ASSET_IDENTIFIER_SCHEMAS,
  CONNECTOR_SCHEMAS,
  ga4PropertyId,
  googleCustomerId,
  isTruncatedLegacyAppendix,
  legacyValidateConnectorConfig,
  mapLegacyAssetIdentifiers,
  metaAdAccountId,
  normalizeAssetIdentifiers,
  normalizeConnectorConfig,
  normalizeHostname,
  projectConnectorFields,
} from "@echolore/shared/contracts";
import { describe, expect, it } from "vitest";

const SECRET_KEYS = new Set(
  Object.values(CONNECTOR_SCHEMAS).flatMap((schema) =>
    schema.secretFields.map((field) => field.key)
  )
);

function legacy(partial: Partial<Parameters<typeof mapLegacyAssetIdentifiers>[0]>) {
  return mapLegacyAssetIdentifiers({
    type: "other",
    externalId: null,
    measurementIds: [],
    publicUrl: null,
    notes: null,
    ...partial,
  });
}

describe("connector identifier schemas", () => {
  it("shares identity field objects between the asset register and connectors", () => {
    expect(ASSET_IDENTIFIER_SCHEMAS.ga4.fields[0]).toBe(ga4PropertyId);
    expect(CONNECTOR_SCHEMAS.ga4.configFields[0]).toBe(ga4PropertyId);
    expect(ASSET_IDENTIFIER_SCHEMAS.meta_ads.fields[0]).toBe(metaAdAccountId);
    expect(CONNECTOR_SCHEMAS.meta_ads.configFields[0]).toBe(metaAdAccountId);
    expect(ASSET_IDENTIFIER_SCHEMAS.google_ads.fields[0]).toBe(googleCustomerId);
    expect(CONNECTOR_SCHEMAS.google_ads.configFields[0]).toBe(googleCustomerId);
  });

  it("keeps secret keys disjoint from asset identifier keys", () => {
    const assetKeys = Object.values(ASSET_IDENTIFIER_SCHEMAS).flatMap((schema) =>
      schema.fields.map((field) => field.key)
    );
    for (const key of assetKeys) expect(SECRET_KEYS.has(key)).toBe(false);
  });

  it("projects only key, kind, required and placeholder", () => {
    const projected = projectConnectorFields("ga4").configFields[0];
    expect(projected).toEqual({
      key: "propertyId",
      kind: "text",
      required: true,
      placeholder: "123456789",
    });
    expect(projected).not.toHaveProperty("pattern");
    expect(projected).not.toHaveProperty("normalize");
    expect(projected).not.toHaveProperty("accountId");
    expect(projected).not.toHaveProperty("connectorConfigKey");
  });
});

describe("legacyValidateConnectorConfig", () => {
  it("keeps the previous predicates, including prefixed ids", () => {
    expect(legacyValidateConnectorConfig("ga4", { propertyId: "123" })).toBeNull();
    expect(legacyValidateConnectorConfig("ga4", { propertyId: "properties/123" })).toBe(
      "propertyId must be numeric"
    );
    expect(
      legacyValidateConnectorConfig("meta_ads", { adAccountId: "act_10", clickType: "link" })
    ).toBeNull();
    expect(
      legacyValidateConnectorConfig("meta_ads", { adAccountId: "10", clickType: "other" })
    ).toBe("clickType must be 'link' or 'all'");
    expect(
      legacyValidateConnectorConfig("google_ads", {
        customerId: "123-456-7890",
        loginCustomerId: "1234567890",
        clientId: "cid",
      })
    ).toBeNull();
    expect(
      legacyValidateConnectorConfig("google_ads", {
        customerId: "customers/1234567890",
        clientId: "cid",
      })
    ).toBe("customerId must be a 10-digit Google Ads customer ID");
    expect(legacyValidateConnectorConfig("google_ads", { customerId: "1234567890" })).toBe(
      "clientId is required"
    );
    expect(legacyValidateConnectorConfig("lp_monitor", { urls: [] })).toBe(
      "At least one URL is required"
    );
    expect(legacyValidateConnectorConfig("lp_monitor", { urls: ["ftp://example.com"] })).toBe(
      "Invalid URL: ftp://example.com"
    );
    expect(legacyValidateConnectorConfig("csv", {})).toBeNull();
  });
});

describe("normalizeAssetIdentifiers", () => {
  it("canonicalizes GA4, Meta and Google identifiers", () => {
    expect(
      normalizeAssetIdentifiers("ga4", { propertyId: "properties/123", measurementId: "g-abc" })
    ).toEqual({
      ok: true,
      value: { propertyId: "123", measurementId: "G-ABC" },
    });
    expect(normalizeAssetIdentifiers("meta_ads", { adAccountId: "act_42", pixelId: "7" })).toEqual({
      ok: true,
      value: { adAccountId: "42", pixelId: "7" },
    });
    expect(normalizeAssetIdentifiers("google_ads", { customerId: "123-456-7890" })).toEqual({
      ok: true,
      value: { customerId: "1234567890" },
    });
  });

  it("rejects a pixel id that still has an act_ prefix", () => {
    const result = normalizeAssetIdentifiers("meta_ads", { adAccountId: "1", pixelId: "act_1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe("pixelId must be numeric");
  });

  it("rejects hostnames that are not ASCII LDH", () => {
    expect(normalizeHostname("日本.jp").ok).toBe(false);
    expect(normalizeHostname("xn--wgv71a.jp")).toEqual({ ok: true, value: "xn--wgv71a.jp" });
    expect(normalizeHostname("https://example.com/path").ok).toBe(false);
    expect(normalizeHostname("https://user:pass@example.com").ok).toBe(false);
    expect(normalizeAssetIdentifiers("domain", { hostname: "Example.COM." })).toEqual({
      ok: true,
      value: { hostname: "example.com" },
    });
  });

  it("rejects credential-like identifier values and unknown keys", () => {
    const credential = normalizeAssetIdentifiers("other", { label: "BEGIN PRIVATE KEY" });
    expect(credential.ok).toBe(false);
    const unknown = normalizeAssetIdentifiers("ga4", { propertyId: "1", pixelId: "2" });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.message).toBe("Unknown identifier: pixelId");
  });

  it("requires the identity fields of each type and allows an empty landing page", () => {
    expect(normalizeAssetIdentifiers("ga4", {}).ok).toBe(false);
    expect(normalizeAssetIdentifiers("landing_page", {})).toEqual({ ok: true, value: {} });
    expect(normalizeAssetIdentifiers("other", {})).toEqual({ ok: true, value: {} });
  });
});

describe("normalizeConnectorConfig", () => {
  it("stores canonical identity values and strips an empty login customer id", () => {
    expect(
      normalizeConnectorConfig("ga4", { propertyId: "properties/123", useGcpDefaults: false })
    ).toEqual({ ok: true, value: { propertyId: "123", useGcpDefaults: false } });
    expect(
      normalizeConnectorConfig("google_ads", {
        customerId: "customers/123-456-7890",
        loginCustomerId: "123-456-7890",
        clientId: "cid",
      })
    ).toEqual({
      ok: true,
      value: { customerId: "1234567890", loginCustomerId: "1234567890", clientId: "cid" },
    });
    expect(
      normalizeConnectorConfig("google_ads", {
        customerId: "1234567890",
        loginCustomerId: "  ",
        clientId: "cid",
      })
    ).toEqual({ ok: true, value: { customerId: "1234567890", clientId: "cid" } });
  });

  it("rejects unknown keys and keeps the current URL error text", () => {
    expect(normalizeConnectorConfig("csv", { surprise: "x" })).toEqual({
      ok: false,
      message: "Unknown config field: surprise",
    });
    expect(normalizeConnectorConfig("lp_monitor", { urls: ["notaurl"] })).toEqual({
      ok: false,
      message: "Invalid URL: notaurl",
    });
    expect(
      normalizeConnectorConfig("meta_ads", { adAccountId: "act_1", clickType: "all" })
    ).toEqual({
      ok: true,
      value: { adAccountId: "1", clickType: "all" },
    });
  });
});

describe("mapLegacyAssetIdentifiers", () => {
  it("maps GA4, preferring the external id when it is a property", () => {
    const mapped = legacy({
      type: "ga4",
      externalId: "properties/42",
      measurementIds: ["g-abc", "G-ABC", "99"],
    });
    expect(mapped.identifiers).toEqual({ propertyId: "42", measurementId: "G-ABC" });
    expect(mapped.unmapped).toEqual(["99"]);
    expect(mapped.notes).toBe("[legacy-identifiers] 99");
  });

  it("maps one Meta account, and a second distinct id as the pixel", () => {
    expect(
      legacy({ type: "meta_ads", externalId: "act_1", measurementIds: ["1"] }).identifiers
    ).toEqual({ adAccountId: "1" });
    expect(
      legacy({ type: "meta_ads", externalId: "act_1", measurementIds: ["2"] }).identifiers
    ).toEqual({ adAccountId: "1", pixelId: "2" });
    expect(
      legacy({ type: "meta_ads", externalId: "label", measurementIds: ["1", "2"] }).identifiers
    ).toEqual({});
    expect(
      legacy({ type: "meta_ads", externalId: "act_1", measurementIds: ["2", "3"] }).identifiers
    ).toEqual({ adAccountId: "1" });
  });

  it("keeps the first Google customer id and the preferred GTM container", () => {
    const google = legacy({
      type: "google_ads",
      externalId: "123-456-7890",
      measurementIds: ["customers/1234567890", "1111111111"],
    });
    expect(google.identifiers).toEqual({ customerId: "1234567890" });
    expect(google.unmapped).toEqual(["1111111111"]);
    const gtm = legacy({
      type: "gtm",
      externalId: "gtm-abc",
      measurementIds: ["G-XXXX", "GTM-OTHER"],
    });
    expect(gtm.identifiers).toEqual({ containerId: "GTM-ABC" });
    expect(gtm.unmapped).toEqual(["G-XXXX", "GTM-OTHER"]);
  });

  it("promotes a landing-page URL only when the public URL is empty", () => {
    const promoted = legacy({ type: "landing_page", externalId: "https://example.com/lp" });
    expect(promoted.identifiers).toEqual({});
    expect(promoted.publicUrl).toBe("https://example.com/lp");
    expect(promoted.unmapped).toEqual([]);
    const kept = legacy({
      type: "landing_page",
      externalId: "https://example.com/other",
      publicUrl: "https://example.com/kept",
    });
    expect(kept.publicUrl).toBe("https://example.com/kept");
    expect(kept.unmapped).toEqual(["https://example.com/other"]);
    const userinfo = legacy({ type: "landing_page", externalId: "https://user:pass@example.com" });
    expect(userinfo.publicUrl).toBeNull();
    expect(userinfo.unmapped).toEqual(["https://user:pass@example.com"]);
  });

  it("maps the first valid hostname and leaves credentials out of other labels", () => {
    expect(
      legacy({ type: "domain", externalId: "日本.jp", measurementIds: ["Example.COM"] }).identifiers
    ).toEqual({ hostname: "example.com" });
    const other = legacy({
      type: "other",
      externalId: "BEGIN PRIVATE KEY",
      measurementIds: ["extra"],
    });
    expect(other.identifiers).toEqual({});
    expect(other.unmapped).toEqual(["BEGIN PRIVATE KEY", "extra"]);
    const labeled = legacy({ type: "other", externalId: "brochure", measurementIds: ["extra"] });
    expect(labeled.identifiers).toEqual({ label: "brochure" });
    expect(labeled.unmapped).toEqual(["extra"]);
  });

  it("does not append a second legacy note and flags a truncated appendix", () => {
    const notes = "already\n[legacy-identifiers] old";
    expect(legacy({ type: "ga4", externalId: "nope", notes }).notes).toBe(notes);
    const long = "x".repeat(4800);
    const truncated = legacy({
      type: "other",
      externalId: "a",
      measurementIds: ["b".repeat(200)],
      notes: long,
    });
    expect(truncated.notesTruncated).toBe(true);
    expect(isTruncatedLegacyAppendix(truncated.notes)).toBe(true);
  });
});
