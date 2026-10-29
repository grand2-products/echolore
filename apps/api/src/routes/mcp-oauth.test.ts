import type { Context, Next } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OAuthClient } from "../db/schema.js";
import type { AppEnv } from "../lib/auth.js";
import { oauthRoutes, wellKnownRoutes } from "./mcp-oauth.js";

const {
  registerOAuthClientMock,
  validateAuthorizeRequestMock,
  issueAuthorizationCodeMock,
  exchangeAuthorizationCodeMock,
  refreshAccessTokenMock,
} = vi.hoisted(() => ({
  registerOAuthClientMock: vi.fn(),
  validateAuthorizeRequestMock: vi.fn(),
  issueAuthorizationCodeMock: vi.fn(),
  exchangeAuthorizationCodeMock: vi.fn(),
  refreshAccessTokenMock: vi.fn(),
}));

vi.mock("../services/auth/mcp-oauth-service.js", () => ({
  registerOAuthClient: registerOAuthClientMock,
  validateAuthorizeRequest: validateAuthorizeRequestMock,
  issueAuthorizationCode: issueAuthorizationCodeMock,
  exchangeAuthorizationCode: exchangeAuthorizationCodeMock,
  refreshAccessToken: refreshAccessTokenMock,
  isValidRedirectUri: (uri: string) => uri.startsWith("https://"),
  OAuthError: class OAuthError extends Error {
    code: string;
    status: number;
    constructor(message: string, code: string, status = 400) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

const { setSession } = vi.hoisted(() => ({
  setSession: vi.fn<() => { withUser: boolean }>(),
}));

vi.mock("../lib/auth.js", async () => {
  const { UserRole } = await import("@echolore/shared/contracts");
  const actual = await vi.importActual<typeof import("../lib/auth.js")>("../lib/auth.js");
  return {
    ...actual,
    authGuard: async (c: Context<AppEnv>, next: Next) => {
      const session = setSession();
      if (!session?.withUser) {
        return c.json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }, 401);
      }
      c.set("user", {
        id: "admin_1",
        email: "admin@example.com",
        name: "Admin",
        role: UserRole.Admin,
      });
      return next();
    },
    requireRole: () => async (_c: Context<AppEnv>, next: Next) => next(),
  };
});

function clientRow(): OAuthClient {
  return {
    id: "ech_cli_1",
    clientName: "ChatGPT connector",
    redirectUris: ["https://chatgpt.com/callback"],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as OAuthClient;
}

const VALID_QUERY = {
  client_id: "ech_cli_1",
  redirect_uri: "https://chatgpt.com/callback",
  response_type: "code",
  scope: "read write",
  state: "s1",
  code_challenge: "c".repeat(43),
  code_challenge_method: "S256",
};

describe("wellKnownRoutes", () => {
  it("serves authorization server metadata", async () => {
    const res = await wellKnownRoutes.request("/oauth-authorization-server", {
      headers: { host: "echolore.example.com" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authorization_endpoint).toContain("/oauth/authorize");
    expect(body.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
  });

  it("serves protected resource metadata pointing at /mcp", async () => {
    const res = await wellKnownRoutes.request("/oauth-protected-resource", {
      headers: { host: "echolore.example.com" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resource).toContain("/mcp");
    expect(body.authorization_servers).toEqual([expect.stringContaining("http")]);
  });
});

describe("oauthRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSession.mockReturnValue({ withUser: true });
  });

  describe("POST /register", () => {
    it("registers a valid client", async () => {
      registerOAuthClientMock.mockResolvedValue(clientRow());
      const res = await oauthRoutes.request("/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "ChatGPT connector",
          redirect_uris: ["https://chatgpt.com/callback"],
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.client_id).toBe("ech_cli_1");
      expect(body.token_endpoint_auth_method).toBe("none");
    });

    it("rejects non-https redirect URIs", async () => {
      const res = await oauthRoutes.request("/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "evil",
          redirect_uris: ["http://evil.example.com/cb"],
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_redirect_uri");
      expect(registerOAuthClientMock).not.toHaveBeenCalled();
    });
  });

  describe("GET /authorize", () => {
    it("requires an authenticated admin session", async () => {
      setSession.mockReturnValue({ withUser: false });
      const res = await oauthRoutes.request(`/authorize?${new URLSearchParams(VALID_QUERY)}`);
      expect(res.status).toBe(401);
    });

    it("renders the consent screen for a valid request", async () => {
      validateAuthorizeRequestMock.mockResolvedValue({
        ok: true,
        value: {
          client: clientRow(),
          redirectUri: VALID_QUERY.redirect_uri,
          scopes: ["read", "write"],
          state: "s1",
          codeChallenge: "c".repeat(43),
        },
      });
      const res = await oauthRoutes.request(`/authorize?${new URLSearchParams(VALID_QUERY)}`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("ChatGPT connector");
      expect(html).toContain("許可する");
    });

    it("redirects back with an error when validation fails safely", async () => {
      validateAuthorizeRequestMock.mockResolvedValue({
        ok: false,
        redirectSafe: true,
        error: { code: "invalid_scope", message: "bad scope" },
      });
      const res = await oauthRoutes.request(`/authorize?${new URLSearchParams(VALID_QUERY)}`);
      expect(res.status).toBe(302);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("error=invalid_scope");
      expect(location).toContain("state=s1");
    });
  });

  describe("POST /authorize", () => {
    it("redirects with a code when the admin allows", async () => {
      validateAuthorizeRequestMock.mockResolvedValue({
        ok: true,
        value: {
          client: clientRow(),
          redirectUri: VALID_QUERY.redirect_uri,
          scopes: ["read"],
          state: "s1",
          codeChallenge: "c".repeat(43),
        },
      });
      issueAuthorizationCodeMock.mockResolvedValue("ech_oac_secret");

      const res = await oauthRoutes.request("/authorize", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ ...VALID_QUERY, action: "allow" }).toString(),
      });
      expect(res.status).toBe(302);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("code=ech_oac_secret");
      expect(location).toContain("state=s1");
    });

    it("redirects with access_denied when denied", async () => {
      validateAuthorizeRequestMock.mockResolvedValue({
        ok: true,
        value: {
          client: clientRow(),
          redirectUri: VALID_QUERY.redirect_uri,
          scopes: ["read"],
          state: "s1",
          codeChallenge: "c".repeat(43),
        },
      });

      const res = await oauthRoutes.request("/authorize", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ ...VALID_QUERY, action: "deny" }).toString(),
      });
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toContain("error=access_denied");
      expect(issueAuthorizationCodeMock).not.toHaveBeenCalled();
    });
  });

  describe("POST /token", () => {
    it("exchanges authorization codes for tokens", async () => {
      exchangeAuthorizationCodeMock.mockResolvedValue({
        accessToken: "ech_agt_x",
        expiresIn: 2592000,
        refreshToken: "ech_rtk_x",
        scopes: ["read"],
      });
      const res = await oauthRoutes.request("/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "ech_cli_1",
          code: "ech_oac_secret",
          redirect_uri: "https://chatgpt.com/callback",
          code_verifier: "v".repeat(64),
        }).toString(),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.access_token).toBe("ech_agt_x");
      expect(body.token_type).toBe("Bearer");
      expect(res.headers.get("cache-control")).toBe("no-store");
    });

    it("rejects unsupported grant types", async () => {
      const res = await oauthRoutes.request("/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "password" }).toString(),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("unsupported_grant_type");
    });
  });
});
