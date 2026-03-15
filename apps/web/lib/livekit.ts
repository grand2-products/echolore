import type { LivekitTokenResponse } from "@echolore/shared/contracts";
import { apiFetch } from "./api";

export const COWORKING_ROOM_NAME = "everybody-coworking";

export function getLiveKitUrl(): string {
  return process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "ws://localhost:7880";
}

export async function fetchLiveKitToken(params: {
  roomName: string;
  participantName: string;
  participantIdentity: string;
}): Promise<string> {
  const result = await apiFetch<LivekitTokenResponse>("/livekit/token", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return result.token;
}
