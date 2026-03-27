import { createServer, type IncomingMessage } from "node:http";
import { WebhookReceiver } from "livekit-server-sdk";
import {
  resolveMeetingByRoomName,
  syncMeetingStatus,
  trackParticipantJoin,
  trackParticipantLeave,
} from "./internal-api-client.js";

export type LiveKitWebhookServerConfig = {
  port: number;
  livekitApiKey: string;
  livekitApiSecret: string;
  apiBaseUrl: string;
  roomAiWorkerSecret: string;
};

function readRequestBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

export async function startLiveKitWebhookServer(config: LiveKitWebhookServerConfig) {
  const receiver = new WebhookReceiver(config.livekitApiKey, config.livekitApiSecret);

  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/livekit/webhook") {
      response.statusCode = 404;
      response.end("Not Found");
      return;
    }

    try {
      const body = await readRequestBody(request);
      const authHeader =
        typeof request.headers.authorization === "string"
          ? request.headers.authorization
          : undefined;
      const event = await receiver.receive(body, authHeader);
      const roomName = event.room?.name;

      if (roomName) {
        try {
          const meeting = await resolveMeetingByRoomName({
            apiBaseUrl: config.apiBaseUrl,
            workerSecret: config.roomAiWorkerSecret,
            roomName,
          });
          const now = new Date().toISOString();

          // Also re-activates ended meetings when participants rejoin
          // (e.g. after a brief network outage that caused room_finished).
          if (event.event === "room_started") {
            await syncMeetingStatus({
              apiBaseUrl: config.apiBaseUrl,
              workerSecret: config.roomAiWorkerSecret,
              meetingId: meeting.id,
              status: "active",
              startedAt: now,
            });
          }

          // Track participant join and sync status concurrently
          if (event.event === "participant_joined") {
            const statusSync = syncMeetingStatus({
              apiBaseUrl: config.apiBaseUrl,
              workerSecret: config.roomAiWorkerSecret,
              meetingId: meeting.id,
              status: "active",
              startedAt: now,
            });

            const participantSync = event.participant
              ? trackParticipantJoin({
                  apiBaseUrl: config.apiBaseUrl,
                  workerSecret: config.roomAiWorkerSecret,
                  meetingId: meeting.id,
                  participantIdentity: event.participant.identity,
                  displayName: event.participant.name || event.participant.identity,
                  isGuest: event.participant.identity.startsWith("guest-"),
                }).catch((err) => {
                  console.error(
                    `[room-ai-worker] participant join tracking failed identity=${event.participant?.identity}`,
                    err
                  );
                })
              : undefined;

            await Promise.all([statusSync, participantSync]);
          }

          if (event.event === "participant_left" && event.participant) {
            const identity = event.participant.identity;
            try {
              await trackParticipantLeave({
                apiBaseUrl: config.apiBaseUrl,
                workerSecret: config.roomAiWorkerSecret,
                meetingId: meeting.id,
                participantIdentity: identity,
              });
            } catch (err) {
              console.error(
                `[room-ai-worker] participant leave tracking failed identity=${identity}`,
                err
              );
            }
          }

          if (event.event === "room_finished") {
            await syncMeetingStatus({
              apiBaseUrl: config.apiBaseUrl,
              workerSecret: config.roomAiWorkerSecret,
              meetingId: meeting.id,
              status: "ended",
              endedAt: now,
            });
          }

          console.log(
            `[room-ai-worker] webhook event=${event.event} room=${roomName} meeting=${meeting.id}`
          );
        } catch (error) {
          console.error(
            `[room-ai-worker] webhook event=${event.event} room=${roomName} meeting sync failed`,
            error
          );
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: "Meeting sync failed" }));
          return;
        }
      } else {
        console.log(`[room-ai-worker] webhook event=${event.event}`);
      }

      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ ok: true }));
    } catch (error) {
      console.error("[room-ai-worker] webhook handling failed", error);
      response.statusCode = 400;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ error: "Invalid webhook" }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, () => resolve());
  });

  console.log(`[room-ai-worker] webhook server started on :${config.port}`);
}
