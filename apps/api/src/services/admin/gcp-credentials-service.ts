import { createSettingsCache } from "./create-settings-cache.js";

export interface GcpCredentials {
  gcpProjectId: string | null;
  gcpServiceAccountKeyJson: string | null;
}

const cache = createSettingsCache<GcpCredentials>({
  keys: [
    "gcpProjectId",
    "gcpServiceAccountKeyJson",
  ],
  mapToSettings: (map) => ({
    gcpProjectId: map.gcpProjectId || null,
    gcpServiceAccountKeyJson: map.gcpServiceAccountKeyJson || null,
  }),
  mapToKeyValues: (input) => ({
    gcpProjectId: input.gcpProjectId ?? undefined,
    gcpServiceAccountKeyJson: input.gcpServiceAccountKeyJson ?? undefined,
  }),
});

export const getGcpCredentials = cache.get;
export const updateGcpCredentials = cache.update;
