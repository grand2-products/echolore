import sharp from "sharp";

/** WebP quality used for PNG re-encoding (0-100; higher = larger, less loss). */
const WEBP_QUALITY = 90;

/**
 * Below this size, re-encoding is unlikely to repay the CPU cost, so we
 * pass the original through unchanged.
 */
const PNG_COMPRESS_THRESHOLD_BYTES = 1 * 1024 * 1024;

/**
 * Defence against PNG "decompression bombs" — small files that decode to huge
 * pixel arrays and exhaust memory. 50M pixels ≈ 7000×7000, which is well above
 * realistic Wiki content but below the OOM danger zone for our API container.
 */
const SHARP_PIXEL_LIMIT = 50_000_000;

/** PNG file signature (RFC 2083, §3.1). */
const PNG_MAGIC = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

export interface CompressResult {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

/**
 * Cheap content sniff: check the first 8 bytes against the PNG signature.
 * Used to short-circuit before invoking sharp on attacker-supplied buffers
 * whose `Content-Type: image/png` is unverified.
 */
function hasPngMagic(buffer: Buffer): boolean {
  if (buffer.length < PNG_MAGIC.length) return false;
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (buffer[i] !== PNG_MAGIC[i]) return false;
  }
  return true;
}

/**
 * Convert a PNG buffer to WebP if doing so would shrink it.
 *
 * Returns `null` (= caller stores original) when any of:
 *  - buffer is below {@link PNG_COMPRESS_THRESHOLD_BYTES}
 *  - buffer is not actually a PNG (header sniff)
 *  - the WebP output is not smaller than the input (avoid silent inflation)
 *
 * Throws if sharp itself fails to decode (truncated / malformed / over the
 * pixel limit). Callers should treat the throw as "fall back to original" —
 * never propagate to the user, since failing the upload over a compression
 * problem would be a regression for valid PNGs that just happen to trip sharp.
 */
export async function compressPngToWebp(
  buffer: Buffer,
  originalFilename: string
): Promise<CompressResult | null> {
  if (buffer.length < PNG_COMPRESS_THRESHOLD_BYTES) return null;
  if (!hasPngMagic(buffer)) return null;

  // Animated PNGs (APNG) collapse to a still on WebP-lossy here. Detect and
  // skip rather than silently dropping the animation. `metadata().pages` is
  // >1 for APNG / GIF / multi-page TIFF — all worth preserving as-is.
  const sharpInstance = sharp(buffer, {
    limitInputPixels: SHARP_PIXEL_LIMIT,
    failOn: "error",
  });
  const meta = await sharpInstance.metadata();
  if ((meta.pages ?? 1) > 1) return null;

  const webpBuffer = await sharpInstance.webp({ quality: WEBP_QUALITY }).toBuffer();

  // Guard against silent inflation — e.g. tiny PNGs with already-optimal
  // compression where the WebP container overhead exceeds the savings.
  if (webpBuffer.length >= buffer.length) return null;

  const baseName = /\.png$/i.test(originalFilename)
    ? originalFilename.replace(/\.png$/i, "")
    : originalFilename;
  return {
    buffer: webpBuffer,
    contentType: "image/webp",
    filename: `${baseName}.webp`,
  };
}
