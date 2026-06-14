import { createTypedSettingsService, FieldCodecs, field } from "./create-settings-cache.js";

/** Default minimum PNG size (KB) above which WebP re-encoding is attempted. */
export const DEFAULT_PNG_COMPRESS_THRESHOLD_KB = 1024;

/**
 * Image-handling settings.
 *
 * These live in a dedicated typed service (60s cache, write-through with
 * invalidation) so the upload hot path (`routes/files.ts`) doesn't pay a DB
 * round-trip per request to read the PNG auto-compression toggle.
 */
export interface ImageSettings {
  /** Whether PNG uploads at/above the threshold should be re-encoded to WebP. */
  pngAutoCompress: boolean;
  /**
   * Minimum PNG size in KB to attempt WebP re-encoding. Uploads smaller than
   * this are passed through unchanged (re-encoding unlikely to repay the CPU).
   */
  pngCompressThresholdKb: number;
}

const cache = createTypedSettingsService({
  pngAutoCompress: field("imagePngAutoCompress", FieldCodecs.boolFalse),
  pngCompressThresholdKb: field(
    "imagePngCompressThresholdKb",
    FieldCodecs.numberWithDefault(DEFAULT_PNG_COMPRESS_THRESHOLD_KB)
  ),
});

export const getImageSettings = cache.get;
export const updateImageSettings = cache.update;
