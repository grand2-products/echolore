import { getGcpCredentials } from "./gcp-credentials-service.js";

export async function resolveGcpCredentials(
  useDefaults: boolean,
  projectId: string | null,
  keyJson: string | null
): Promise<{ gcsProjectId?: string; gcsKeyJson?: string }> {
  let gcsProjectId = projectId ?? undefined;
  let gcsKeyJson = keyJson ?? undefined;

  if (useDefaults) {
    try {
      const gcpCreds = await getGcpCredentials();
      gcsProjectId = gcpCreds.gcpProjectId ?? undefined;
      gcsKeyJson = gcpCreds.gcpServiceAccountKeyJson ?? undefined;
      if (!gcsKeyJson) {
        console.warn(
          "[GCP] useGcpDefaults is true but no service account key found in site_settings"
        );
      }
    } catch (err) {
      console.warn("[GCP] Failed to load GCP credentials from site_settings:", err);
    }
  }

  return { gcsProjectId, gcsKeyJson };
}
