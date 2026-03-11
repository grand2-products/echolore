const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

type AccessTokenResponse = {
  access_token?: string;
};

export async function getGoogleCloudAccessToken(): Promise<string> {
  const envToken =
    process.env.GOOGLE_TTS_ACCESS_TOKEN?.trim() ?? process.env.GOOGLE_CLOUD_ACCESS_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }

  const response = await fetch(METADATA_TOKEN_URL, {
    headers: {
      "Metadata-Flavor": "Google",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Google Cloud access token: ${response.status}`);
  }

  const data = (await response.json()) as AccessTokenResponse;
  const accessToken = data.access_token?.trim();
  if (!accessToken) {
    throw new Error("Google Cloud access token response was empty");
  }

  return accessToken;
}
