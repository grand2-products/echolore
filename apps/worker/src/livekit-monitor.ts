import { RoomServiceClient } from "livekit-server-sdk";

export type LiveKitMonitorConfig = {
  host: string;
  apiKey: string;
  apiSecret: string;
};

export async function inspectRooms(config: LiveKitMonitorConfig) {
  const client = new RoomServiceClient(config.host, config.apiKey, config.apiSecret);
  const rooms = await client.listRooms();

  return Promise.all(
    rooms.map(async (room) => {
      const participants = await client.listParticipants(room.name);
      return {
        roomName: room.name,
        participantCount: participants.length,
        participants: participants.map((participant) => ({
          identity: participant.identity,
          name: participant.name,
        })),
      };
    })
  );
}
