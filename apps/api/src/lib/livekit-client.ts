import { RoomServiceClient } from "livekit-server-sdk";
import { livekitApiKey, livekitApiSecret, livekitHost } from "./livekit-config.js";

export const roomService = new RoomServiceClient(livekitHost, livekitApiKey, livekitApiSecret);
