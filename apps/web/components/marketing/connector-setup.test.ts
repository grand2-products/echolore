import { describe, expect, it } from "vitest";
import { buildSetupRequest, emptySetupFields } from "./connector-setup";

describe("buildSetupRequest", () => {
  it("asks GA4 only for a numeric property and a JSON key", () => {
    const fields = emptySetupFields();
    fields.propertyId = "properties/123";
    fields.serviceAccountKeyJson = JSON.stringify({ client_email: "a@b.c", private_key: "x" });
    const result = buildSetupRequest("ga4", fields);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body).toEqual({
      name: "GA4 123",
      type: "ga4",
      config: { propertyId: "123" },
      secrets: { serviceAccountKeyJson: fields.serviceAccountKeyJson },
      enabled: true,
    });
    expect(result.body).not.toHaveProperty("timezone");
    expect(result.body).not.toHaveProperty("currency");
  });

  it("rejects a measurement id and a key that is not JSON", () => {
    const fields = emptySetupFields();
    fields.propertyId = "G-ABC123";
    fields.serviceAccountKeyJson = "{}";
    expect(buildSetupRequest("ga4", fields)).toEqual({ ok: false, issue: "measurement_id" });

    fields.propertyId = "123";
    fields.serviceAccountKeyJson = "not-json";
    expect(buildSetupRequest("ga4", fields)).toEqual({ ok: false, issue: "json" });
  });

  it("keeps Meta and Google Ads to their required fields", () => {
    const meta = emptySetupFields();
    meta.adAccountId = "act_42";
    meta.accessToken = "token";
    const metaResult = buildSetupRequest("meta_ads", meta);
    expect(metaResult.ok).toBe(true);
    if (metaResult.ok) {
      expect(metaResult.body.config).toEqual({ adAccountId: "42" });
      expect(metaResult.body).not.toHaveProperty("timezone");
    }

    const ads = emptySetupFields();
    ads.customerId = "123-456-7890";
    ads.clientId = "cid";
    ads.developerToken = "dev";
    ads.clientSecret = "sec";
    ads.refreshToken = "ref";
    const adsResult = buildSetupRequest("google_ads", ads);
    expect(adsResult.ok).toBe(true);
    if (adsResult.ok) {
      expect(adsResult.body.config).toEqual({ customerId: "1234567890", clientId: "cid" });
      expect(adsResult.body).not.toHaveProperty("currency");
    }
  });
});
