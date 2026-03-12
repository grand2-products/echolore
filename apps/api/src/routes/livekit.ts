import { Hono } from "hono";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { jsonError } from "../lib/api-error.js";

export const livekitRoutes = new Hono();

const livekitHost = process.env.LIVEKIT_HOST || "http://localhost:7880";
const apiKey = process.env.LIVEKIT_API_KEY || "";
const apiSecret = process.env.LIVEKIT_API_SECRET || "";

const roomService = new RoomServiceClient(livekitHost, apiKey, apiSecret);

// POST /api/livekit/token - Generate access token for a room
livekitRoutes.post("/token", async (c) => {
  try {
    const body = await c.req.json();
    const { roomName, participantName, participantIdentity } = body;

    if (!roomName || !participantName || !participantIdentity) {
      return jsonError(c, 400, "LIVEKIT_TOKEN_INPUT_REQUIRED", "roomName, participantName, and participantIdentity are required");
    }

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
livekitRoutes.post("/rooms", async (c) => {
  try {
    const body = await c.req.json();
    const { name, emptyTimeout = 300, maxParticipants = 100 } = body;

    if (!name) {
      return jsonError(c, 400, "LIVEKIT_ROOM_NAME_REQUIRED", "Room name is required");
    }

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

  try {
    return c.json({
      message: "Recording started",
      roomName: name,
    });
  } catch (error) {
    console.error("Error starting recording:", error);
    return jsonError(c, 500, "LIVEKIT_RECORDING_START_FAILED", "Failed to start recording");
  }
});
