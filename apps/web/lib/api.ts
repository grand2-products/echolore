/**
 * Backward-compatibility re-export.
 * All API code now lives in ./api/ — this file ensures any imports
 * that resolve to `lib/api.ts` (rather than `lib/api/index.ts`) still work.
 */
export * from "./api/index";
