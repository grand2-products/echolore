import { afterEach, describe, expect, it, vi } from "vitest";

describe("auth flow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getGoogleSignInAction returns Auth.js signin URL", async () => {
    vi.stubGlobal("window", {
      location: { origin: "http://localhost:3000" },
    });
    vi.stubGlobal("document", { querySelector: () => null });

    const { getGoogleSignInAction } = await import("./auth-flow");
    const action = getGoogleSignInAction();

    expect(action).toContain("/api/auth/signin/google");
  });

  it("fetchCsrfToken fetches from Auth.js csrf endpoint", async () => {
    vi.stubGlobal("window", {
      location: { origin: "http://localhost:3000" },
    });
    vi.stubGlobal("document", { querySelector: () => null });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ csrfToken: "test-token" }),
      })
    );

    const { fetchCsrfToken } = await import("./auth-flow");
    const token = await fetchCsrfToken();

    expect(token).toBe("test-token");
  });

  it("logoutCurrentUser POSTs signout and redirects to /login", async () => {
    const assignMock = vi.fn();

    vi.stubGlobal("window", {
      location: { origin: "http://localhost:3000", assign: assignMock },
    });
    vi.stubGlobal("document", { querySelector: () => null });

    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ csrfToken: "test-token" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { logoutCurrentUser } = await import("./auth-flow");
    await logoutCurrentUser();

    // First call is fetchCsrfToken, second is the signout POST
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [signoutUrl, signoutInit] = fetchMock.mock.calls[1]!;
    expect(signoutUrl).toEqual(expect.stringContaining("/api/auth/signout"));
    expect(signoutInit.method).toBe("POST");
    expect(signoutInit.body).toContain("csrfToken=test-token");
    expect(assignMock).toHaveBeenCalledWith("/login");
  });
});
