import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { jsonError } from "../lib/api-error.js";
import type { AppEnv } from "../lib/auth.js";

export const coworkingHlsRoutes = new Hono<AppEnv>();

const HLS_TOKEN_SECRET = process.env.AUTH_SECRET ?? "dev-hls-secret";
const HLS_TOKEN_TTL_SECONDS = 3600; // 1 hour

/** Generate a signed HLS access token for an authenticated user. */
export function generateHlsToken(): { token: string; expires: number } {
  const expires = Math.floor(Date.now() / 1000) + HLS_TOKEN_TTL_SECONDS;
  const payload = `hls:${expires}`;
  const sig = createHmac("sha256", HLS_TOKEN_SECRET).update(payload).digest("hex");
  return { token: `${expires}.${sig}`, expires };
}

/** Verify an HLS access token. Returns true if valid and not expired. */
function verifyHlsToken(token: string): boolean {
  const dotIndex = token.indexOf(".");
  if (dotIndex < 1) return false;

  const expiresStr = token.slice(0, dotIndex);
  const providedSig = token.slice(dotIndex + 1);
  const expires = Number(expiresStr);

  if (Number.isNaN(expires) || expires < Math.floor(Date.now() / 1000)) return false;

  const expectedSig = createHmac("sha256", HLS_TOKEN_SECRET)
    .update(`hls:${expiresStr}`)
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(providedSig, "hex"), Buffer.from(expectedSig, "hex"));
  } catch {
    return false;
  }
}

function resolveHlsDir(): string {
  if (process.env.FILE_STORAGE_PATH) {
    return path.join(process.env.FILE_STORAGE_PATH, "coworking-hls");
  }
  // Fallback: cwd is apps/api when run via turborepo, so go up 2 levels to repo root
  return path.resolve(process.cwd(), "../../data/files/coworking-hls");
}

const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/;

coworkingHlsRoutes.get("/:filename", async (c) => {
  // Verify signed token (passed as query parameter since hls.js cannot attach headers)
  const hlsToken = c.req.query("token");
  if (!hlsToken || !verifyHlsToken(hlsToken)) {
    return jsonError(c, 401, "HLS_UNAUTHORIZED", "Invalid or expired HLS token");
  }

  const { filename } = c.req.param();
  const hlsDir = resolveHlsDir();

  // Validate filename to prevent path traversal
  if (!SAFE_FILENAME.test(filename)) {
    return jsonError(c, 400, "INVALID_FILENAME", "Invalid filename");
  }

  const filePath = path.join(hlsDir, filename);

  try {
    const data = await readFile(filePath);

    let contentType = "application/octet-stream";
    if (filename.endsWith(".m3u8")) {
      contentType = "application/vnd.apple.mpegurl";
    } else if (filename.endsWith(".ts")) {
      contentType = "video/mp2t";
    }

    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    return jsonError(c, 404, "FILE_NOT_FOUND", "HLS file not found");
  }
});
