import { afterEach, describe, expect, it, vi } from "vitest";
import { type ApiError, authApi, fetchApi, usersApi, wikiApi } from "./api";

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

    await fetchApi<{ ok: boolean }>("/health-like");

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
      new Response(
        JSON.stringify({ pages: [], searchMeta: { mode: "lexical", semanticApplied: false } }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    await wikiApi.searchPages("foo bar", { semantic: false });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/wiki/search?q=foo%20bar&semantic=0",
      expect.objectContaining({
        credentials: "include",
      })
    );
  });

  it("surfaces API error payload messages and codes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "Forbidden", code: "FORBIDDEN", message: "Denied by policy" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    await expect(fetchApi("/denied")).rejects.toMatchObject({
      message: "Forbidden",
      status: 403,
      code: "FORBIDDEN",
      detail: "Denied by policy",
    } satisfies Partial<ApiError>);
  });

  it("posts Google token exchange requests through the auth API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: "access",
          refreshToken: "refresh",
          expiresAt: "2026-03-12T00:00:00.000Z",
          user: {
            id: "user_1",
            email: "member@example.com",
            name: "Member",
            role: "member",
            avatarUrl: null,
          },
          authMode: "sso",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    await authApi.exchangeGoogleToken({ idToken: "google-id-token", deviceName: "Pixel 9" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/auth/token/google",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ idToken: "google-id-token", deviceName: "Pixel 9" }),
      })
    );
  });

  it("calls the current-user session revoke endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await usersApi.revokeAuthSession("rt_1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/users/me/sessions/rt_1",
      expect.objectContaining({
        method: "DELETE",
        credentials: "include",
      })
    );
  });
});
