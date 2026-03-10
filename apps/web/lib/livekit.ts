import { apiFetch } from "./api";

export interface LiveKitTokenResponse {
  token: string;
}

export function getLiveKitUrl(): string {
  return process.env.NEXT_PUBLIC_LIVEKIT_URL ?? "ws://localhost:7880";
}

export async function fetchLiveKitToken(params: {
  roomName: string;
  participantName: string;
  participantIdentity: string;
}): Promise<string> {
  const result = await apiFetch<LiveKitTokenResponse>("/api/livekit/token", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return result.token;
}

