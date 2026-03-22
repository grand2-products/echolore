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
    } catch {
      /* fall through to ADC */
    }
  }

  return { gcsProjectId, gcsKeyJson };
}
