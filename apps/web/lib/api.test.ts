import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, wikiApi } from "./api";

describe("api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes credentials on generic API requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await apiFetch<{ ok: boolean }>("/health-like");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/health-like",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("encodes wiki search queries and semantic flags", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ pages: [], searchMeta: { mode: "lexical", semanticApplied: false } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await wikiApi.searchPages("foo bar", { semantic: false });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/wiki/search?q=foo%20bar&semantic=0",
      expect.objectContaining({
        credentials: "include",
      })
    );
  });

  it("surfaces API error payload messages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(apiFetch("/denied")).rejects.toThrow("Forbidden");
  });
});
