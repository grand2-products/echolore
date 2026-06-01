import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { compressPngToWebp } from "./image-compress.js";

/**
 * Safety-focused tests for the PNG→WebP compressor.
 *
 * The function is invoked by `routes/files.ts` on user-uploaded buffers whose
 * `Content-Type: image/png` is *unverified* (client-controlled). These tests
 * lock in the defences that prevent that surface from becoming a vector for
 * resource exhaustion, silent data corruption, or accidental inflation.
 */

const THRESHOLD = 1 * 1024 * 1024; // keep in sync with PNG_COMPRESS_THRESHOLD_BYTES

/** Generate a PNG of the given pixel dimensions with random colour data. */
async function makeRandomPng(width: number, height: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = Math.floor(Math.random() * 256);
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

/** Generate a PNG of the given pixel dimensions filled with a solid colour. */
async function makeSolidPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 64, g: 128, b: 192 },
    },
  })
    .png()
    .toBuffer();
}

describe("compressPngToWebp — size threshold", () => {
  it("returns null for buffers below the 1 MB threshold (skip work entirely)", async () => {
    const small = await makeRandomPng(64, 64);
    expect(small.length).toBeLessThan(THRESHOLD);

    const result = await compressPngToWebp(small, "small.png");
    expect(result).toBeNull();
  });
});

describe("compressPngToWebp — content sniffing (header guard)", () => {
  it("returns null when the buffer is not actually a PNG, even if claimed to be", async () => {
    // A non-PNG payload at or above the threshold — would otherwise reach sharp
    // and waste decode work on every spoofed upload. The magic-byte guard
    // short-circuits before sharp is touched.
    const fakePng = Buffer.alloc(THRESHOLD + 1, 0x00);
    fakePng.write("NOT A PNG, JUST JUNK BYTES", 0, "utf8");

    const result = await compressPngToWebp(fakePng, "evil.png");
    expect(result).toBeNull();
  });

  it("returns null for a JPEG buffer that lies about being a PNG", async () => {
    const jpeg = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg({ quality: 100 })
      .toBuffer();
    // Padding to push above threshold without breaking the JPEG header.
    const padded = Buffer.concat([jpeg, Buffer.alloc(THRESHOLD)]);

    const result = await compressPngToWebp(padded, "lie.png");
    expect(result).toBeNull();
  });
});

describe("compressPngToWebp — inflation guard", () => {
  it("returns null if the WebP output is not smaller than the input", async () => {
    // Random noise compresses very poorly into WebP at quality 90 relative to
    // PNG's optimised filtering on the same payload, so WebP can come out
    // larger. The guard must catch this and refuse the swap.
    const noisy = await makeRandomPng(1200, 1200);
    expect(noisy.length).toBeGreaterThan(THRESHOLD);

    const webpDirect = await sharp(noisy).webp({ quality: 90 }).toBuffer();
    // Only meaningful if WebP genuinely doesn't shrink it on this input.
    if (webpDirect.length < noisy.length) {
      // Skip silently — random noise compressed well this time; not the case
      // we're trying to exercise.
      return;
    }

    const result = await compressPngToWebp(noisy, "noisy.png");
    expect(result).toBeNull();
  });

  it("returns a smaller WebP when compression genuinely helps", async () => {
    // Solid colour PNGs compress dramatically into WebP at q=90.
    const flat = await makeSolidPng(2000, 2000);
    // Pad with appended zero bytes so the input clears the 1 MB threshold even
    // when PNG's own compression of a solid colour is very efficient. (Those
    // appended bytes sit after IEND so PNG decoders ignore them.)
    const padded = flat.length >= THRESHOLD ? flat : Buffer.concat([flat, Buffer.alloc(THRESHOLD)]);

    const result = await compressPngToWebp(padded, "flat.png");
    expect(result).not.toBeNull();
    if (!result) return; // type-guard for TS
    expect(result.contentType).toBe("image/webp");
    expect(result.buffer.length).toBeLessThan(padded.length);
    expect(result.filename).toBe("flat.webp");
  });
});

describe("compressPngToWebp — filename derivation", () => {
  it("strips the .png extension case-insensitively before appending .webp", async () => {
    const flat = await makeSolidPng(2000, 2000);
    const padded = Buffer.concat([flat, Buffer.alloc(THRESHOLD)]);

    const lower = await compressPngToWebp(padded, "diagram.png");
    const upper = await compressPngToWebp(padded, "DIAGRAM.PNG");
    const mixed = await compressPngToWebp(padded, "Diagram.Png");

    expect(lower?.filename).toBe("diagram.webp");
    expect(upper?.filename).toBe("DIAGRAM.webp");
    expect(mixed?.filename).toBe("Diagram.webp");
  });

  it("only strips a trailing .png — internal '.png' substrings are preserved", async () => {
    const flat = await makeSolidPng(2000, 2000);
    const padded = Buffer.concat([flat, Buffer.alloc(THRESHOLD)]);

    const result = await compressPngToWebp(padded, "my.png.archive.png");
    expect(result?.filename).toBe("my.png.archive.webp");
  });

  it("appends .webp when the original has no .png extension (sniffed PNG)", async () => {
    const flat = await makeSolidPng(2000, 2000);
    const padded = Buffer.concat([flat, Buffer.alloc(THRESHOLD)]);

    const result = await compressPngToWebp(padded, "screenshot");
    expect(result?.filename).toBe("screenshot.webp");
  });

  it("does not introduce path separators or unsafe characters of its own", async () => {
    // The caller (`files.ts`) sanitises the final filename, but we want to
    // make sure this layer never *invents* characters the caller would have
    // to strip — only the `.webp` suffix is added.
    const flat = await makeSolidPng(2000, 2000);
    const padded = Buffer.concat([flat, Buffer.alloc(THRESHOLD)]);

    const result = await compressPngToWebp(padded, "../../etc/passwd.png");
    // We do NOT strip the dangerous prefix here — that's the caller's job —
    // but we also must not add anything new beyond changing the suffix.
    expect(result?.filename).toBe("../../etc/passwd.webp");
  });
});

describe("compressPngToWebp — adversarial input handling", () => {
  it("throws on a truncated PNG so the caller's catch falls back to original", async () => {
    // A buffer that passes the magic-byte sniff (real PNG header) but whose
    // body is truncated. sharp must reject this. The caller (`files.ts`) wraps
    // the call in try/catch and stores the original buffer on throw.
    const flat = await makeSolidPng(2000, 2000);
    const padded = Buffer.concat([flat, Buffer.alloc(THRESHOLD)]);
    // Keep the header (magic + IHDR) but lop off the rest of the IDAT stream.
    const corrupted = Buffer.concat([padded.subarray(0, 64), Buffer.alloc(THRESHOLD, 0xff)]);

    await expect(compressPngToWebp(corrupted, "broken.png")).rejects.toThrow();
  });

  it("rejects PNGs whose declared pixel count exceeds the per-image cap", async () => {
    // 7100×7100 = 50,410,000 pixels — just over the 50M SHARP_PIXEL_LIMIT.
    // Using a solid colour keeps PNG encoding cheap, but the resulting file is
    // ~700 KB (well-compressed), so we pad it past the 1 MB byte threshold
    // with appended bytes (PNG decoders ignore everything after IEND).
    const solid = await makeSolidPng(7100, 7100);
    const padded =
      solid.length >= THRESHOLD ? solid : Buffer.concat([solid, Buffer.alloc(THRESHOLD)]);
    expect(padded.length).toBeGreaterThan(THRESHOLD);

    // sharp throws "Input image exceeds pixel limit" (or similar). The exact
    // message is internal to sharp and may change between versions — we only
    // assert that *some* throw occurs. The defence we care about is: this
    // never silently allocates a 50M-pixel decoded canvas.
    await expect(compressPngToWebp(padded, "huge.png")).rejects.toThrow();
  });
});

describe("compressPngToWebp — animated PNG (APNG)", () => {
  it("returns null for a multi-page (animated) input rather than collapsing to a still", async () => {
    // Build an animated PNG with 3 frames. sharp can encode multi-frame PNG
    // when given a tall RGBA buffer and `animated.delay` / `pageHeight`.
    const w = 200;
    const h = 200;
    const frames = 3;
    const channels = 4; // RGBA
    const stripe = Buffer.alloc(w * h * frames * channels);
    // Three differently-coloured frames stacked vertically.
    for (let f = 0; f < frames; f++) {
      const start = f * w * h * channels;
      const r = f === 0 ? 255 : 0;
      const g = f === 1 ? 255 : 0;
      const b = f === 2 ? 255 : 0;
      for (let i = 0; i < w * h; i++) {
        stripe[start + i * 4 + 0] = r;
        stripe[start + i * 4 + 1] = g;
        stripe[start + i * 4 + 2] = b;
        stripe[start + i * 4 + 3] = 255;
      }
    }
    // sharp encodes APNG when the raw input declares a pageHeight that
    // divides the total height — that signals multi-frame layout.
    const animatedPng = await sharp(stripe, {
      raw: { width: w, height: h * frames, channels: 4, pageHeight: h },
    })
      .png()
      .toBuffer();

    // Verify our fixture actually is multi-page (otherwise the test would be
    // vacuous — sharp would have ignored the `animated` flag).
    const fixtureMeta = await sharp(animatedPng).metadata();
    if ((fixtureMeta.pages ?? 1) <= 1) {
      // sharp on this platform didn't produce APNG — skip rather than asserting
      // a property of the host environment.
      return;
    }

    // Pad to push above the 1 MB threshold.
    const padded = Buffer.concat([animatedPng, Buffer.alloc(THRESHOLD)]);
    const result = await compressPngToWebp(padded, "anim.png");
    expect(result).toBeNull();
  });
});

describe("compressPngToWebp — return type invariants", () => {
  it("when returning a result, all three fields are consistent", async () => {
    const flat = await makeSolidPng(2000, 2000);
    const padded = Buffer.concat([flat, Buffer.alloc(THRESHOLD)]);

    const result = await compressPngToWebp(padded, "diagram.png");
    expect(result).not.toBeNull();
    if (!result) return;

    // contentType matches what the file *actually* is
    expect(result.contentType).toBe("image/webp");
    // The returned buffer is a real, decodable WebP
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe("webp");
    // size in the API DB row will be `result.buffer.length` — ensure it
    // matches the buffer the caller will hand to storage.
    expect(result.buffer.length).toBeGreaterThan(0);
    // Filename suffix matches contentType
    expect(result.filename.endsWith(".webp")).toBe(true);
  });
});
