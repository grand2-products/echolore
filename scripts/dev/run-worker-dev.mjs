import { spawn } from "node:child_process";

function normalizeLocalHttpUrl(rawValue, fallbackPort) {
  const fallback = `http://localhost:${fallbackPort}`;
  if (!rawValue) {
    return fallback;
  }

  try {
    const url = new URL(rawValue);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      url.port = fallbackPort;
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    return fallback;
  }

  return rawValue;
}

const apiPort = process.env.API_PORT || process.env.PORT || "3001";
const livekitPort = process.env.LIVEKIT_PORT || "7880";

const child = spawn("tsx", ["watch", "src/index.ts"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    ROOM_AI_API_BASE_URL: normalizeLocalHttpUrl(process.env.ROOM_AI_API_BASE_URL, apiPort),
    LIVEKIT_HOST: normalizeLocalHttpUrl(process.env.LIVEKIT_HOST, livekitPort),
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
