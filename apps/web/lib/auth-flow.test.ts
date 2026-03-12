import { afterEach, describe, expect, it, vi } from "vitest";

const logoutMock = vi.hoisted(() => vi.fn());

vi.mock("./api", () => ({
  authApi: {
    logout: logoutMock,
  },
}));

describe("auth flow", () => {
  afterEach(() => {
    logoutMock.mockReset();
    vi.restoreAllMocks();
  });

  it("redirects SSO logout through the auth gateway", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", {
      location: {
        assign,
        origin: "http://localhost:17720",
      },
    });

    const { logoutCurrentUser } = await import("./auth-flow");

    await logoutCurrentUser("sso");

    expect(assign).toHaveBeenCalledWith("http://localhost:17720/oauth2/sign_out");
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it("logs out password sessions and invokes the post-logout callback", async () => {
    logoutMock.mockResolvedValue({ success: true });
    const onSignedOut = vi.fn();
    vi.stubGlobal("window", {
      location: {
        assign: vi.fn(),
        origin: "http://localhost:17720",
      },
    });

    const { logoutCurrentUser } = await import("./auth-flow");

    await logoutCurrentUser("password", { onSignedOut });

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });
});
