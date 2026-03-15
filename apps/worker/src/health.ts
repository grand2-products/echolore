import { type Server, createServer } from "node:http";

let healthy = true;

export function setHealthy(value: boolean): void {
  healthy = value;
}

export function startHealthServer(port: number): Server {
  const server = createServer((req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      const status = healthy ? 200 : 503;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: healthy ? "ok" : "unhealthy" }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port, () => {
    console.log(`[room-ai-worker] health server started on :${port}`);
  });

  return server;
}
