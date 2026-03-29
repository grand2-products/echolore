import { AccessToken, DataPacket_Kind } from "livekit-server-sdk";
import { roomService } from "../../lib/livekit-client.js";
import { livekitApiKey, livekitApiSecret } from "../../lib/livekit-config.js";

const encoder = new TextEncoder();

export async function createAituberRoom(roomName: string): Promise<void> {
  await roomService.createRoom({
    name: roomName,
    emptyTimeout: 600,
    maxParticipants: 500,
  });
}

export async function deleteAituberRoom(roomName: string): Promise<void> {
  try {
    await roomService.deleteRoom(roomName);
  } catch (error) {
    console.warn(`[aituber-livekit] Failed to delete room ${roomName}:`, error);
  }
}

export async function generateViewerToken(
  roomName: string,
  identity: string,
  name: string
): Promise<string> {
  const at = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity,
    name,
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: false,
    canSubscribe: true,
    canPublishData: true,
  });

  return at.toJwt();
}

export async function generateAiParticipantToken(
  roomName: string,
  sessionId: string
): Promise<string> {
  const at = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: `ai-character-${sessionId}`,
    name: "AI Character",
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return at.toJwt();
}

export async function sendDataToRoom(
  roomName: string,
  data: Record<string, unknown>
): Promise<void> {
  const payload = encoder.encode(JSON.stringify(data));
  await roomService.sendData(roomName, payload, DataPacket_Kind.RELIABLE, {
    topic: "aituber",
  });
}

export async function getParticipantCount(roomName: string): Promise<number> {
  try {
    const participants = await roomService.listParticipants(roomName);
    return participants.length;
  } catch {
    return 0;
  }
}
