import { spawn } from "node:child_process";

function normalizeLocalHttpUrl(rawValue, fallbackPort, pathname = "") {
  const fallback = `http://localhost:${fallbackPort}${pathname}`;
  if (!rawValue) {
    return fallback;
  }

  try {
    const url = new URL(rawValue);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      url.port = fallbackPort;
      url.pathname = pathname || url.pathname;
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    return fallback;
  }

  return rawValue;
}

function normalizeLocalWsUrl(rawValue, fallbackPort) {
  const fallback = `ws://localhost:${fallbackPort}`;
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

const port = process.env.WEB_PORT || "3000";
const apiPort = process.env.API_PORT || process.env.PORT || "3001";
const livekitPort = process.env.LIVEKIT_PORT || "7880";

const child = spawn("next", ["dev", "--turbopack", "--port", port], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    WEB_PORT: port,
    NEXT_PUBLIC_API_URL: normalizeLocalHttpUrl(process.env.NEXT_PUBLIC_API_URL, apiPort),
    NEXT_PUBLIC_LIVEKIT_URL: normalizeLocalWsUrl(process.env.NEXT_PUBLIC_LIVEKIT_URL, livekitPort),
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
