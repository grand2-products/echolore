import type { LivekitTokenResponse } from "@echolore/shared/contracts";
import { fetchApi } from "./api";
import { getPublicLivekitUrl } from "./runtime-env";

export const COWORKING_ROOM_NAME = "everybody-coworking";

export function getLiveKitUrl(): string {
  return getPublicLivekitUrl();
}

export async function fetchLiveKitToken(params: {
  roomName: string;
  participantName: string;
  participantIdentity: string;
}): Promise<string> {
  const result = await fetchApi<LivekitTokenResponse>("/livekit/token", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return result.token;
}
