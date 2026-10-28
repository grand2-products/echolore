import { afterEach, describe, expect, it, vi } from "vitest";
import { _setGa4TokenProviderForTests, readGa4AccountLocale } from "./ga4.js";

describe("readGa4AccountLocale", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    _setGa4TokenProviderForTests(async () => {
      throw new Error("GA4 token provider was left stubbed");
    });
  });

  it("reads timezone and currency from the Admin API property", async () => {
    _setGa4TokenProviderForTests(async () => "token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(String(url)).toContain("/properties/123");
        expect(String(url)).not.toContain("token");
        return new Response(
          JSON.stringify({ timeZone: "America/Los_Angeles", currencyCode: "USD" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    await expect(
      readGa4AccountLocale({
        config: { propertyId: "123" },
        secrets: { serviceAccountKeyJson: "{}" },
        timezone: "Asia/Tokyo",
        currency: "JPY",
      })
    ).resolves.toEqual({ timezone: "America/Los_Angeles", currency: "USD" });
  });
});
