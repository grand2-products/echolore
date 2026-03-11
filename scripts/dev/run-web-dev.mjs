import { spawn } from "node:child_process";

const port = process.env.WEB_PORT || process.env.PORT || "3000";

const child = spawn("next", ["dev", "--turbopack", "--port", port], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
