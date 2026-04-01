import { createTypedSettingsService, FieldCodecs, field } from "./create-settings-cache.js";

export interface DriveSettings {
  driveEnabled: boolean;
  sharedDriveIds: string | null; // comma-separated IDs
  syncIntervalMinutes: number | null;
  includeMimeTypes: string | null; // comma-separated MIME types
  excludeFolderIds: string | null; // comma-separated folder IDs
  maxFileSizeBytes: number | null;
}

const DEFAULT_MIME_TYPES = [
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
  "application/pdf",
].join(",");

const cache = createTypedSettingsService({
  driveEnabled: field("driveEnabled", FieldCodecs.boolFalse),
  sharedDriveIds: field("driveSharedDriveIds", FieldCodecs.nullable),
  syncIntervalMinutes: field("driveSyncIntervalMinutes", FieldCodecs.nullableNumber),
  includeMimeTypes: field("driveIncludeMimeTypes", FieldCodecs.nullable),
  excludeFolderIds: field("driveExcludeFolderIds", FieldCodecs.nullable),
  maxFileSizeBytes: field("driveMaxFileSizeBytes", FieldCodecs.nullableNumber),
});

export const getDriveSettings = cache.get;
export const updateDriveSettings = cache.update;

/** Parse comma-separated string into trimmed array, filtering empties. */
function parseCsv(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Resolved settings with arrays instead of CSV strings. */
export interface ResolvedDriveSettings {
  enabled: boolean;
  sharedDriveIds: string[];
  syncIntervalMinutes: number;
  includeMimeTypes: string[];
  excludeFolderIds: string[];
  maxFileSizeBytes: number;
}

export async function getResolvedDriveSettings(): Promise<ResolvedDriveSettings> {
  const s = await getDriveSettings();
  return {
    enabled: s.driveEnabled,
    sharedDriveIds: parseCsv(s.sharedDriveIds),
    syncIntervalMinutes: s.syncIntervalMinutes ?? 60,
    includeMimeTypes:
      parseCsv(s.includeMimeTypes).length > 0
        ? parseCsv(s.includeMimeTypes)
        : parseCsv(DEFAULT_MIME_TYPES),
    excludeFolderIds: parseCsv(s.excludeFolderIds),
    maxFileSizeBytes: s.maxFileSizeBytes ?? 10 * 1024 * 1024,
  };
}
