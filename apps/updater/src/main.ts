import { verifySecret } from "./auth.ts";
import {
  handleCheck,
  handleHealth,
  handleProgress,
  handleRollback,
  handleStatus,
  handleUpdate,
} from "./routes.ts";
import { loadState } from "./state.ts";
import { resumeAfterSelfUpdate } from "./update-runner.ts";

const PORT = Number(Deno.env.get("PORT") ?? "8787");

type RouteHandler = (request: Request) => Promise<Response>;

const routes: Record<string, Record<string, RouteHandler>> = {
  GET: {
    "/health": handleHealth,
    "/status": handleStatus,
    "/check": handleCheck,
    "/progress": handleProgress,
  },
  POST: {
    "/update": handleUpdate,
    "/rollback": handleRollback,
  },
};

function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  // Health check is unauthenticated
  if (url.pathname === "/health" && method === "GET") {
    return handleHealth();
  }

  // All other endpoints require secret
  if (!verifySecret(request)) {
    return Promise.resolve(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );
  }

  const routeHandler = routes[method]?.[url.pathname];
  if (routeHandler) {
    return routeHandler(request);
  }

  return Promise.resolve(
    new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  );
}

// On startup, check if we need to resume after a self-update
async function init() {
  await loadState();
  await resumeAfterSelfUpdate();
}

init().catch((e) => {
  console.error("[updater] Init error:", e);
});

Deno.serve({ port: PORT }, handler);
console.log(`[updater] Listening on :${PORT}`);
