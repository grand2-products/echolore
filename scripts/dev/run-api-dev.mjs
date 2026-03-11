import { spawn } from "node:child_process";

const port = process.env.API_PORT || process.env.PORT || "3001";

const child = spawn("tsx", ["watch", "src/index.ts"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    PORT: port,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
