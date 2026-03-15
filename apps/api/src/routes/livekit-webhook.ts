import { Hono } from "hono";
import { WebhookReceiver } from "livekit-server-sdk";
import { livekitApiKey, livekitApiSecret } from "../lib/livekit-config.js";
import {
  COWORKING_ROOM,
  handleCoworkingEgressEnded,
  stopCoworkingComposite,
} from "../services/coworking/coworking-mcu-service.js";
import { handleEgressWebhook } from "../services/meeting/recording-service.js";

const webhookReceiver = new WebhookReceiver(livekitApiKey, livekitApiSecret);

export const livekitWebhookRoutes = new Hono();

livekitWebhookRoutes.post("/", async (c) => {
  let eventType: string | undefined;
  try {
    const body = await c.req.text();
    const authHeader = c.req.header("authorization") ?? "";

    let event: Awaited<ReturnType<typeof webhookReceiver.receive>> | undefined;
    try {
      event = await webhookReceiver.receive(body, authHeader);
    } catch (verifyError) {
      console.error("[livekit-webhook] Signature verification failed:", verifyError);
      return c.json({ error: "Unauthorized" }, 401);
    }

    eventType = event.event;

    // Handle egress events for recording
    if (
      event.event === "egress_started" ||
      event.event === "egress_updated" ||
      event.event === "egress_ended"
    ) {
      console.log(
        `[livekit-webhook] Processing ${event.event} for egress ${event.egressInfo?.egressId ?? "unknown"}`
      );
      await handleEgressWebhook(
        event as {
          egressInfo?: {
            egressId: string;
            status: number;
            fileResults?: Array<{
              filename?: string;
              size?: bigint | number;
              duration?: bigint | number;
            }>;
            error?: string;
          };
        }
      );

      // Handle coworking composite egress ended or aborted
      if (event.egressInfo?.egressId) {
        const egressStatus = event.egressInfo.status;
        // EgressStatus: EGRESS_COMPLETE=2, EGRESS_ABORTED=4, EGRESS_FAILED=5
        if (event.event === "egress_ended" || egressStatus === 4 || egressStatus === 5) {
          handleCoworkingEgressEnded(event.egressInfo.egressId);
        }
      }
    } else if (event.event === "participant_left" && event.room?.name === COWORKING_ROOM) {
      // Check if only the egress bot remains — if so, stop composite
      const remainingCount = event.room.numParticipants ?? 0;
      // Egress itself counts as a participant; stop when it's the only one (or none)
      if (remainingCount <= 1) {
        console.log(
          `[livekit-webhook] Coworking room has ${remainingCount} participant(s) left, stopping composite`
        );
        await stopCoworkingComposite();
      }
    } else {
      console.log(`[livekit-webhook] Received event: ${event.event} (no handler)`);
    }

    return c.json({ ok: true });
  } catch (error) {
    console.error(`[livekit-webhook] Error processing ${eventType ?? "unknown"} webhook:`, error);
    return c.json({ error: "Webhook processing failed" }, 500);
  }
});
