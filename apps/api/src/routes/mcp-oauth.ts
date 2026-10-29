import { UserRole } from "@echolore/shared/contracts";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv, SessionUser } from "../lib/auth.js";
import { authGuard, requireRole } from "../lib/auth.js";
import {
  exchangeAuthorizationCode,
  issueAuthorizationCode,
  isValidRedirectUri,
  OAuthError,
  refreshAccessToken,
  registerOAuthClient,
  validateAuthorizeRequest,
} from "../services/auth/mcp-oauth-service.js";

/**
 * OAuth 2.1 routes for MCP clients:
 *   GET  /.well-known/oauth-authorization-server  — authorization server metadata
 *   GET  /.well-known/oauth-protected-resource    — protected resource metadata
 *   POST /oauth/register                           — RFC 7591 dynamic client registration
 *   GET  /oauth/authorize                          — admin consent screen (admin session)
 *   POST /oauth/authorize                          — consent submission → redirect with code
 *   POST /oauth/token                              — code+PKCE / refresh_token grants
 *
 * Access tokens issued here are ordinary agent tokens (`ech_agt_...`),
 * resolved by /mcp exactly like admin-issued tokens.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function requestOrigin(c: { req: { url: string } }): string {
  try {
    return new URL(c.req.url).origin;
  } catch {
    return "";
  }
}

// ─── Well-known metadata ───────────────────────────────────────────

export const wellKnownRoutes = new Hono<AppEnv>();

wellKnownRoutes.get("/oauth-authorization-server", (c) => {
  const origin = requestOrigin(c);
  return c.json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    scopes_supported: ["read", "write"],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    service_documentation: `${origin}/docs`,
  });
});

wellKnownRoutes.get("/oauth-protected-resource", (c) => {
  const origin = requestOrigin(c);
  return c.json({
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: ["read", "write"],
    resource_documentation: `${origin}/docs`,
  });
});

// ─── OAuth router ──────────────────────────────────────────────────

export const oauthRoutes = new Hono<AppEnv>();

const registerSchema = z.object({
  client_name: z.string().min(1).max(100).default("MCP client"),
  redirect_uris: z.array(z.string().min(1).max(2000)).min(1).max(10),
});

oauthRoutes.post("/register", zValidator("json", registerSchema), async (c) => {
  const data = c.req.valid("json");
  const invalid = data.redirect_uris.filter((uri) => !isValidRedirectUri(uri));
  if (invalid.length > 0) {
    return c.json(
      {
        error: "invalid_redirect_uri",
        error_description:
          "redirect_uris must be absolute https URLs (http allowed only for loopback)",
        invalid_redirect_uris: invalid,
      },
      400
    );
  }
  const client = await registerOAuthClient({
    clientName: data.client_name,
    redirectUris: data.redirect_uris,
  });
  return c.json(
    {
      client_id: client.id,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    201
  );
});

// ─── Authorization endpoint (admin consent) ────────────────────────

const AUTHORIZE_FIELDS = [
  "client_id",
  "redirect_uri",
  "response_type",
  "scope",
  "state",
  "code_challenge",
  "code_challenge_method",
] as const;

oauthRoutes.use("/authorize", authGuard, requireRole(UserRole.Admin));

function authorizeErrorPage(message: string): Response {
  return new Response(
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>EchoLore — Authorization error</title></head>` +
      `<body style="font-family:sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem">` +
      `<h1>Authorization error / 認可リクエストエラー</h1><p>${escapeHtml(message)}</p></body></html>`,
    { status: 400, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

function redirectWithError(
  redirectUri: string,
  error: string,
  description: string,
  state: string | null
): Response {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
}

oauthRoutes.get("/authorize", async (c) => {
  const query = c.req.query();
  const result = await validateAuthorizeRequest({
    clientId: query.client_id ?? "",
    redirectUri: query.redirect_uri ?? "",
    responseType: query.response_type ?? "",
    scope: query.scope,
    state: query.state,
    codeChallenge: query.code_challenge,
    codeChallengeMethod: query.code_challenge_method,
  });

  if (!result.ok) {
    if (result.redirectSafe) {
      return redirectWithError(
        query.redirect_uri ?? "",
        result.error.code,
        result.error.message,
        query.state ?? null
      );
    }
    return authorizeErrorPage(result.error.message);
  }

  const { client, scopes, state } = result.value;
  const scopeLabels = scopes
    .map((s) => (s === "write" ? "ページ作成 (write)" : "読み取り (read)"))
    .join(", ");

  const hiddenFields = AUTHORIZE_FIELDS.map((field) => {
    const value = field === "state" ? (state ?? "") : (query[field] ?? "");
    return `<input type="hidden" name="${field}" value="${escapeHtml(value)}">`;
  }).join("\n        ");

  const user = c.get("user") as SessionUser;
  const html =
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>EchoLore — 外部 AI エージェントの接続許可</title></head>` +
    `<body style="font-family:sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#111827">` +
    `<h1 style="font-size:1.4rem">外部 AI エージェントの接続許可</h1>` +
    `<p style="line-height:1.7">アプリ <strong>${escapeHtml(client.clientName)}</strong> が EchoLore の Wiki へのアクセスを求めています。</p>` +
    `<ul style="line-height:1.8"><li>要求スコープ: <strong>${escapeHtml(scopeLabels)}</strong></li>` +
    `<li>アクセス権限: <strong>${escapeHtml(user.name)}</strong> (${escapeHtml(user.email)}) と同じ読み取り権限で動作します</li>` +
    `<li>アクセストークンの有効期限: 30日 (失効はいつでも管理画面から可能)</li></ul>` +
    `<form method="post" action="/oauth/authorize" style="display:flex;gap:0.75rem;margin-top:2rem">` +
    `        ${hiddenFields}` +
    `<button type="submit" name="action" value="allow" style="background:#2563eb;color:#fff;border:none;border-radius:0.5rem;padding:0.6rem 1.4rem;font-size:0.95rem;cursor:pointer">許可する</button>` +
    `<button type="submit" name="action" value="deny" style="background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:0.5rem;padding:0.6rem 1.4rem;font-size:0.95rem;cursor:pointer">拒否する</button>` +
    `</form>` +
    `<p style="margin-top:2rem;font-size:0.8rem;color:#6b7280">Authorize “${escapeHtml(client.clientName)}” to access your EchoLore wiki with your read permissions.</p>` +
    `</body></html>`;

  return c.html(html);
});

oauthRoutes.post("/authorize", async (c) => {
  const form = (await c.req.parseBody({ all: true })) as Record<string, string | string[]>;
  const field = (name: (typeof AUTHORIZE_FIELDS)[number]): string => {
    const value = form[name];
    return typeof value === "string" ? value : "";
  };
  const action = typeof form.action === "string" ? form.action : "";

  const result = await validateAuthorizeRequest({
    clientId: field("client_id"),
    redirectUri: field("redirect_uri"),
    responseType: field("response_type"),
    scope: field("scope") || undefined,
    state: field("state") || undefined,
    codeChallenge: field("code_challenge") || undefined,
    codeChallengeMethod: field("code_challenge_method") || undefined,
  });

  if (!result.ok) {
    if (result.redirectSafe) {
      return redirectWithError(
        field("redirect_uri"),
        result.error.code,
        result.error.message,
        field("state") || null
      );
    }
    return authorizeErrorPage(result.error.message);
  }

  const { scopes, state } = result.value;

  if (action !== "allow") {
    return redirectWithError(
      result.value.redirectUri,
      "access_denied",
      "The administrator denied the request",
      state
    );
  }

  const user = c.get("user") as SessionUser;
  const code = await issueAuthorizationCode({
    clientId: result.value.client.id,
    userId: user.id,
    redirectUri: result.value.redirectUri,
    scopes,
    codeChallenge: result.value.codeChallenge,
  });

  const url = new URL(result.value.redirectUri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  return new Response(null, { status: 302, headers: { location: url.toString() } });
});

// ─── Token endpoint ────────────────────────────────────────────────

oauthRoutes.post("/token", async (c) => {
  const form = (await c.req.parseBody({ all: true })) as Record<string, string | string[]>;
  const field = (name: string): string => {
    const value = form[name];
    return typeof value === "string" ? value : "";
  };

  const tokenError = (error: OAuthError) =>
    c.json({ error: error.code, error_description: error.message }, error.status as 400 | 401);

  try {
    const grantType = field("grant_type");
    if (grantType === "authorization_code") {
      const grant = await exchangeAuthorizationCode({
        clientId: field("client_id"),
        code: field("code"),
        redirectUri: field("redirect_uri"),
        codeVerifier: field("code_verifier"),
      });
      return c.json(
        {
          access_token: grant.accessToken,
          token_type: "Bearer",
          expires_in: grant.expiresIn,
          refresh_token: grant.refreshToken,
          scope: grant.scopes.join(" "),
        },
        200,
        { "cache-control": "no-store", pragma: "no-cache" }
      );
    }
    if (grantType === "refresh_token") {
      const grant = await refreshAccessToken({
        clientId: field("client_id"),
        refreshToken: field("refresh_token"),
      });
      return c.json(
        {
          access_token: grant.accessToken,
          token_type: "Bearer",
          expires_in: grant.expiresIn,
          refresh_token: grant.refreshToken,
          scope: grant.scopes.join(" "),
        },
        200,
        { "cache-control": "no-store", pragma: "no-cache" }
      );
    }
    return tokenError(new OAuthError("Unsupported grant_type", "unsupported_grant_type"));
  } catch (error) {
    if (error instanceof OAuthError) return tokenError(error);
    console.error("oauth token endpoint failed:", error);
    return tokenError(new OAuthError("Token request failed", "invalid_request", 400));
  }
});
