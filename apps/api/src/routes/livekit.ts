import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { z } from "zod";
import { jsonError } from "../lib/api-error.js";
import type { AppEnv } from "../lib/auth.js";
import { livekitApiKey, livekitApiSecret, livekitHost } from "../lib/livekit-config.js";
import * as recordingService from "../services/meeting/recording-service.js";

export const livekitRoutes = new Hono<AppEnv>();

const livekitTokenSchema = z.object({
  roomName: z.string().min(1).max(200),
  participantName: z.string().min(1).max(200),
  participantIdentity: z.string().min(1).max(200),
});

const apiKey = livekitApiKey;
const apiSecret = livekitApiSecret;

if (!apiKey || !apiSecret) {
  console.warn("[livekit] LIVEKIT_API_KEY / LIVEKIT_API_SECRET not set — LiveKit routes will fail at runtime");
}

const roomService = new RoomServiceClient(livekitHost, apiKey, apiSecret);

// POST /api/livekit/token - Generate access token for a room
livekitRoutes.post("/token", zValidator("json", livekitTokenSchema), async (c) => {
  try {
    const { roomName, participantName, participantIdentity } = c.req.valid("json");

    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantIdentity,
      name: participantName,
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return c.json({ token });
  } catch (error) {
    console.error("Error generating token:", error);
    return jsonError(c, 500, "LIVEKIT_TOKEN_GENERATE_FAILED", "Failed to generate token");
  }
});

// GET /api/livekit/rooms - List all rooms
livekitRoutes.get("/rooms", async (c) => {
  try {
    const rooms = await roomService.listRooms();
    return c.json({ rooms });
  } catch (error) {
    console.error("Error listing rooms:", error);
    return jsonError(c, 500, "LIVEKIT_ROOMS_LIST_FAILED", "Failed to list rooms");
  }
});

// POST /api/livekit/rooms - Create a new room
const createRoomSchema = z.object({
  name: z.string().min(1).max(128),
  emptyTimeout: z.number().int().min(60).max(3600).default(300),
  maxParticipants: z.number().int().min(1).max(500).default(100),
});

livekitRoutes.post("/rooms", async (c) => {
  try {
    const body = await c.req.json();
    const parsed = createRoomSchema.safeParse(body);

    if (!parsed.success) {
      return jsonError(c, 400, "LIVEKIT_ROOM_VALIDATION_FAILED", parsed.error.errors.map((e) => e.message).join(", "));
    }

    const { name, emptyTimeout, maxParticipants } = parsed.data;

    const room = await roomService.createRoom({
      name,
      emptyTimeout,
      maxParticipants,
    });

    return c.json({ room }, 201);
  } catch (error) {
    console.error("Error creating room:", error);
    return jsonError(c, 500, "LIVEKIT_ROOM_CREATE_FAILED", "Failed to create room");
  }
});

// DELETE /api/livekit/rooms/:name - Delete a room
livekitRoutes.delete("/rooms/:name", async (c) => {
  const { name } = c.req.param();

  try {
    await roomService.deleteRoom(name);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting room:", error);
    return jsonError(c, 500, "LIVEKIT_ROOM_DELETE_FAILED", "Failed to delete room");
  }
});

// GET /api/livekit/rooms/:name/participants - List participants in a room
livekitRoutes.get("/rooms/:name/participants", async (c) => {
  const { name } = c.req.param();

  try {
    const participants = await roomService.listParticipants(name);
    return c.json({ participants });
  } catch (error) {
    console.error("Error listing participants:", error);
    return jsonError(c, 500, "LIVEKIT_PARTICIPANTS_LIST_FAILED", "Failed to list participants");
  }
});

// POST /api/livekit/rooms/:name/start-recording - Start recording
livekitRoutes.post("/rooms/:name/start-recording", async (c) => {
  const { name } = c.req.param();
  const user = c.get("user");

  try {
    const body = await c.req.json().catch(() => ({}));
    const meetingId = (body as Record<string, string>).meetingId;
    if (!meetingId) {
      return jsonError(c, 400, "MEETING_ID_REQUIRED", "meetingId is required");
    }

    const { egressInfo, recording } = await recordingService.startRecording(
      name,
      meetingId,
      user?.id ?? "unknown",
    );
    return c.json({ egressId: egressInfo.egressId, recording });
  } catch (error) {
    console.error("Error starting recording:", error);
    return jsonError(c, 500, "LIVEKIT_RECORDING_START_FAILED", "Failed to start recording");
  }
});

// POST /api/livekit/rooms/:name/stop-recording - Stop recording
livekitRoutes.post("/rooms/:name/stop-recording", async (c) => {
  try {
    const body = await c.req.json();
    const egressId = (body as Record<string, string>).egressId;
    if (!egressId) {
      return jsonError(c, 400, "EGRESS_ID_REQUIRED", "egressId is required");
    }

    await recordingService.stopRecording(egressId);
    return c.json({ success: true });
  } catch (error) {
    console.error("Error stopping recording:", error);
    return jsonError(c, 500, "LIVEKIT_RECORDING_STOP_FAILED", "Failed to stop recording");
  }
});

// GET /api/livekit/rooms/:name/recording-status - Get recording status
livekitRoutes.get("/rooms/:name/recording-status", async (c) => {
  try {
    const body = c.req.query("meetingId");
    if (!body) {
      return jsonError(c, 400, "MEETING_ID_REQUIRED", "meetingId query param is required");
    }

    const recordings = await recordingService.getRecordingStatus(body);
    return c.json({ recordings });
  } catch (error) {
    console.error("Error getting recording status:", error);
    return jsonError(c, 500, "LIVEKIT_RECORDING_STATUS_FAILED", "Failed to get recording status");
  }
});
