import { createSign } from "node:crypto";

interface AppCredentials {
  appId: string;
  privateKey: string;
  installationId: number;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<number, CachedToken>();

export { tokenCache };

function base64Url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlJson(value: unknown): string {
  return base64Url(Buffer.from(JSON.stringify(value)));
}

function generateAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iat: now - 60, exp: now + 600, iss: appId };
  const encodedHeader = base64UrlJson(header);
  const encodedPayload = base64UrlJson(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createSign("RSA-SHA256").update(signingInput).end().sign(privateKey);
  return `${signingInput}.${base64Url(signature)}`;
}

async function createInstallationToken(
  creds: AppCredentials
): Promise<{ token: string; expiresAt: number }> {
  const jwt = generateAppJwt(creds.appId, creds.privateKey);
  const resp = await fetch(
    `https://api.github.com/app/installations/${creds.installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
      },
    }
  );
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`GitHub installation token request failed: ${data.message ?? resp.status}`);
  }
  const expiresAt = data.expires_at
    ? new Date(data.expires_at).getTime()
    : Date.now() + 60 * 60 * 1000;
  return { token: data.token, expiresAt };
}

export async function getInstallationToken(creds: AppCredentials): Promise<string> {
  const cached = tokenCache.get(creds.installationId);
  const now = Date.now();
  if (cached && cached.expiresAt - now > 5 * 60 * 1000) {
    return cached.token;
  }
  const { token, expiresAt } = await createInstallationToken(creds);
  tokenCache.set(creds.installationId, { token, expiresAt });
  return token;
}

const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_RATE_LIMIT_WAIT_MS = 120_000; // 2 minutes

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRateLimit(
  url: string,
  options: RequestInit,
  installationId: number,
  retryCount = 0
): Promise<Response> {
  const resp = await fetch(url, options);

  const remaining = parseInt(resp.headers.get("X-RateLimit-Remaining") ?? "999", 10);
  if (remaining <= 100) {
    const resetAt = parseInt(resp.headers.get("X-RateLimit-Reset") ?? "0", 10) * 1000;
    const waitMs = Math.min(Math.max(resetAt - Date.now(), 0), MAX_RATE_LIMIT_WAIT_MS);
    console.log(
      JSON.stringify({ event: "github.ratelimit.approaching", installationId, remaining, waitMs })
    );
    if (waitMs > 0) await sleep(waitMs);
  }

  if (resp.status === 403 && resp.headers.get("X-RateLimit-Remaining") === "0") {
    if (retryCount >= MAX_RATE_LIMIT_RETRIES) {
      console.log(
        JSON.stringify({ event: "github.ratelimit.max_retries", installationId, retryCount })
      );
      // Return the unconsumed response so callers can still read the body
      return resp;
    }
    // Consume the response body before retrying to prevent connection leaks
    await resp.text().catch(() => {});
    const resetAt = parseInt(resp.headers.get("X-RateLimit-Reset") ?? "0", 10) * 1000;
    const waitMs = Math.min(Math.max(resetAt - Date.now(), 60_000), MAX_RATE_LIMIT_WAIT_MS);
    await sleep(waitMs);
    return fetchWithRateLimit(url, options, installationId, retryCount + 1);
  }

  return resp;
}

export async function fetchGitHub(
  apiPath: string,
  token: string,
  installationId: number
): Promise<Response> {
  return fetchWithRateLimit(
    `https://api.github.com${apiPath}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
    installationId
  );
}
