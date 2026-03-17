import { createTypedSettingsService, FieldCodecs, field } from "./create-settings-cache.js";

export interface GcpCredentials {
  gcpProjectId: string | null;
  gcpServiceAccountKeyJson: string | null;
}

const cache = createTypedSettingsService({
  gcpProjectId: field("gcpProjectId", FieldCodecs.nullable),
  gcpServiceAccountKeyJson: field("gcpServiceAccountKeyJson", FieldCodecs.nullable),
});

export const getGcpCredentials = cache.get;
export const updateGcpCredentials = cache.update;
