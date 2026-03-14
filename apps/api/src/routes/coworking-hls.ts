import { Hono } from "hono";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AppEnv } from "../lib/auth.js";
import { jsonError } from "../lib/api-error.js";

export const coworkingHlsRoutes = new Hono<AppEnv>();

function resolveHlsDir(): string {
  if (process.env.FILE_STORAGE_PATH) {
    return path.join(process.env.FILE_STORAGE_PATH, "coworking-hls");
  }
  // Fallback: cwd is apps/api when run via turborepo, so go up 2 levels to repo root
  return path.resolve(process.cwd(), "../../data/files/coworking-hls");
}

const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/;

coworkingHlsRoutes.get("/:filename", async (c) => {
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
