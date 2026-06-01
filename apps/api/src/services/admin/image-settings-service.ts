import { createTypedSettingsService, FieldCodecs, field } from "./create-settings-cache.js";

/**
 * Image-handling settings.
 *
 * These live in a dedicated typed service (60s cache, write-through with
 * invalidation) so the upload hot path (`routes/files.ts`) doesn't pay a DB
 * round-trip per request to read the PNG auto-compression toggle.
 */
export interface ImageSettings {
  /** Whether PNG uploads ≥1 MB should be re-encoded to WebP on the API side. */
  pngAutoCompress: boolean;
}

const cache = createTypedSettingsService({
  pngAutoCompress: field("imagePngAutoCompress", FieldCodecs.boolFalse),
});

export const getImageSettings = cache.get;
export const updateImageSettings = cache.update;
