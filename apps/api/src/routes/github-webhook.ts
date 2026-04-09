import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { getResolvedGithubSettings } from "../services/admin/github-settings-service.js";
import { triggerGithubPushSyncSerialized } from "../services/github/github-sync-service.js";
import {
  handleInstallationEvent,
  handleInstallationReposEvent,
} from "../services/github/github-webhook-handler.js";

export const githubWebhookRoutes = new Hono();

function verifyWebhookSignature(
  body: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(sigBuffer, expectedBuffer);
}

githubWebhookRoutes.post("/webhook", async (c) => {
  const settings = await getResolvedGithubSettings();
  if (!settings.enabled) {
    return c.json({ error: "GitHub integration not enabled" }, 400);
  }

  const signature = c.req.header("X-Hub-Signature-256");
  const deliveryId = c.req.header("X-GitHub-Delivery") ?? "unknown";
  const body = await c.req.text();

  if (!verifyWebhookSignature(body, signature, settings.webhookSecret)) {
    return c.json({ error: "Invalid signature" }, 403);
  }

  const event = c.req.header("X-GitHub-Event");

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const logWebhookError = (err: unknown) =>
    console.error(
      JSON.stringify({
        event: "github.webhook.handler_error",
        deliveryId,
        githubEvent: event,
        error: err instanceof Error ? err.message : String(err),
      })
    );

  switch (event) {
    case "push":
      void triggerGithubPushSyncSerialized(
        payload as unknown as Parameters<typeof triggerGithubPushSyncSerialized>[0]
      ).catch(logWebhookError);
      break;
    case "installation":
      void handleInstallationEvent(
        payload as unknown as Parameters<typeof handleInstallationEvent>[0]
      ).catch(logWebhookError);
      break;
    case "installation_repositories":
      void handleInstallationReposEvent(
        payload as unknown as Parameters<typeof handleInstallationReposEvent>[0]
      ).catch(logWebhookError);
      break;
    case "ping":
      return c.json({ msg: "pong" });
  }

  console.log(JSON.stringify({ event: "github.webhook.accepted", deliveryId, githubEvent: event }));
  return c.json({ ok: true }, 202);
});
