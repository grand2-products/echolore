import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

// We need to set the env before importing the module
vi.stubEnv("ROOM_AI_WORKER_SECRET", "test-worker-secret");

// Re-import after env is set (dynamic import to pick up env)
const { requireRoomAiWorker } = await import("./internal-auth.js");

describe("requireRoomAiWorker", () => {
  it("allows requests with valid worker secret", async () => {
    const app = new Hono();
    app.use("/*", requireRoomAiWorker);
    app.get("/test", (c) => c.json({ ok: true }));

    const response = await app.request("http://localhost/test", {
      headers: { "x-room-ai-worker-secret": "test-worker-secret" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects requests with wrong secret", async () => {
    const app = new Hono();
    app.use("/*", requireRoomAiWorker);
    app.get("/test", (c) => c.json({ ok: true }));

    const response = await app.request("http://localhost/test", {
      headers: { "x-room-ai-worker-secret": "wrong-secret-value" },
    });

    expect(response.status).toBe(401);
  });

  it("rejects requests without secret header", async () => {
    const app = new Hono();
    app.use("/*", requireRoomAiWorker);
    app.get("/test", (c) => c.json({ ok: true }));

    const response = await app.request("http://localhost/test");

    expect(response.status).toBe(401);
  });

  it("rejects requests with empty secret header", async () => {
    const app = new Hono();
    app.use("/*", requireRoomAiWorker);
    app.get("/test", (c) => c.json({ ok: true }));

    const response = await app.request("http://localhost/test", {
      headers: { "x-room-ai-worker-secret": "" },
    });

    expect(response.status).toBe(401);
  });
});
