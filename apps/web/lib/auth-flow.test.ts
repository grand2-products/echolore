import { afterEach, describe, expect, it, vi } from "vitest";

describe("auth flow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects to Auth.js signout", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", {
      location: {
        assign,
        origin: "http://localhost:17720",
      },
    });

    const { logoutCurrentUser } = await import("./auth-flow");

    await logoutCurrentUser();

    expect(assign).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/signout"),
    );
  });
});
