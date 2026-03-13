import { describe, expect, it } from "vitest";
import { buildCurrentReturnTo, buildLoginUrl, normalizeReturnTo } from "./return-to";

describe("return-to helpers", () => {
  it("keeps valid app-relative returnTo values", () => {
    expect(normalizeReturnTo("/wiki/abc?tab=edit")).toBe("/wiki/abc?tab=edit");
  });

  it("rejects decoded protocol-relative redirect targets", () => {
    expect(normalizeReturnTo("/%2F%2Fevil.com")).toBeNull();
  });

  it("rejects auth loop targets", () => {
    expect(normalizeReturnTo("/login?returnTo=%2Fwiki")).toBeNull();
    expect(normalizeReturnTo("/api/auth/signin")).toBeNull();
  });

  it("builds login URLs only from safe returnTo values", () => {
    expect(buildLoginUrl("/meetings/abc?q=1")).toBe("/login?returnTo=%2Fmeetings%2Fabc%3Fq%3D1");
    expect(buildLoginUrl("https://evil.com")).toBe("/login");
  });

  it("preserves the current pathname and search params", () => {
    const searchParams = new URLSearchParams({ q: "roadmap", page: "2" });
    expect(buildCurrentReturnTo("/search", searchParams)).toBe("/search?q=roadmap&page=2");
  });
});
