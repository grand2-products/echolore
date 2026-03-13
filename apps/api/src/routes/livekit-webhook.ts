import { Hono } from "hono";
import { WebhookReceiver } from "livekit-server-sdk";
import { livekitApiKey, livekitApiSecret } from "../lib/livekit-config.js";
import { handleEgressWebhook } from "../services/meeting/recording-service.js";

const webhookReceiver = new WebhookReceiver(livekitApiKey, livekitApiSecret);

export const livekitWebhookRoutes = new Hono();

livekitWebhookRoutes.post("/", async (c) => {
  try {
    const body = await c.req.text();
    const authHeader = c.req.header("authorization") ?? "";
    const event = await webhookReceiver.receive(body, authHeader);

    // Handle egress events for recording
    if (
      event.event === "egress_started" ||
      event.event === "egress_updated" ||
      event.event === "egress_ended"
    ) {
      await handleEgressWebhook(event as { egressInfo?: { egressId: string; status: number; fileResults?: Array<{ filename?: string; size?: bigint | number; duration?: bigint | number }>; error?: string } });
    }

    return c.json({ ok: true });
  } catch (error) {
    console.error("[livekit-webhook] Error processing webhook:", error);
    return c.json({ error: "Webhook processing failed" }, 500);
  }
});
