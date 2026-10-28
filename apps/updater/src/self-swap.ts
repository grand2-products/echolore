import { exec } from "./exec.ts";
import type { UpdaterState } from "./state.ts";
import { saveState } from "./state.ts";

const UPDATER_CONTAINER = Deno.env.get("UPDATER_CONTAINER_NAME") ?? "echolore-updater";
const NEXT_CONTAINER = `${UPDATER_CONTAINER}-next`;

function shellQuote(arg: string): string {
  return `'${arg.replaceAll("'", `'\\''`)}'`;
}

async function selfContainerId(): Promise<string> {
  try {
    return (await Deno.readTextFile("/etc/hostname")).trim();
  } catch {
    return "";
  }
}

/** Updater image resolved from the deployed compose file (env interpolated). */
async function desiredUpdaterImage(): Promise<string | null> {
  const cfg = await exec(["docker", "compose", "config", "--format", "json"]);
  if (cfg.code !== 0) return null;
  try {
    const parsed = JSON.parse(cfg.stdout);
    const image = parsed?.services?.updater?.image;
    return typeof image === "string" && image.length > 0 ? image : null;
  } catch {
    return null;
  }
}

/**
 * The updater cannot recreate its own container through compose: a recreate
 * stops the caller before the replacement container is created, killing the
 * compose client mid-operation. Instead — after every other service is
 * updated and healthy — start the replacement beside us from the freshly
 * pulled image, then stop ourselves. The replacement's boot path
 * (resumeAfterSelfUpdate) removes the old container and takes its name.
 */
export async function swapUpdaterIfNeeded(state: UpdaterState): Promise<boolean> {
  const desired = await desiredUpdaterImage();
  if (!desired) {
    console.error("[updater] Could not resolve updater image from compose; skipping self-swap");
    return false;
  }

  const inspect = await exec(["docker", "container", "inspect", UPDATER_CONTAINER]);
  if (inspect.code !== 0) return false;

  let running: {
    Image?: string;
    Config?: {
      Env?: string[];
      Labels?: Record<string, string>;
      User?: string;
      WorkingDir?: string;
      Healthcheck?: {
        Test?: string[];
        Interval?: number;
        Timeout?: number;
        Retries?: number;
        StartPeriod?: number;
      };
    };
    HostConfig?: {
      Binds?: string[];
      RestartPolicy?: { Name?: string };
      ExtraHosts?: string[];
    };
    NetworkSettings?: { Networks?: Record<string, { Aliases?: (string | null)[] }> };
  };
  try {
    running = JSON.parse(inspect.stdout)[0];
  } catch {
    return false;
  }
  if (!running || running.Image === desired) return false;

  const cfg = running.Config ?? {};
  const hc = running.HostConfig ?? {};
  const args = ["docker", "run", "-d", "--name", NEXT_CONTAINER];
  if (cfg.User) args.push("--user", cfg.User);
  if (cfg.WorkingDir) args.push("-w", cfg.WorkingDir);
  for (const e of [...(cfg.Env ?? []), "UPDATER_SWAP_PENDING=1"]) args.push("-e", e);
  for (const [k, v] of Object.entries(cfg.Labels ?? {})) {
    // Stale by definition — the replacement runs the new image/config.
    if (k === "com.docker.compose.config-hash") continue;
    args.push("--label", `${k}=${v}`);
  }
  for (const b of hc.Binds ?? []) args.push("-v", b);
  for (const h of hc.ExtraHosts ?? []) args.push("--add-host", h);
  const [netName, net] = Object.entries(running.NetworkSettings?.Networks ?? {})[0] ?? [];
  if (netName) {
    args.push("--network", netName);
    for (const a of net?.Aliases ?? []) {
      if (a) args.push("--network-alias", a);
    }
  }
  const health = cfg.Healthcheck;
  if (health?.Test && health.Test[0] === "CMD" && health.Test.length > 1) {
    args.push("--health-cmd", health.Test.slice(1).join(" "));
    if (health.Interval) args.push("--health-interval", `${health.Interval / 1e9}s`);
    if (health.Timeout) args.push("--health-timeout", `${health.Timeout / 1e9}s`);
    if (health.Retries !== undefined) args.push("--health-retries", String(health.Retries));
    if (health.StartPeriod) args.push("--health-start-period", `${health.StartPeriod / 1e9}s`);
  }
  args.push("--restart", hc.RestartPolicy?.Name || "unless-stopped");
  args.push(desired);

  const run = await exec(args);
  if (run.code !== 0) {
    console.error("[updater] Failed to start replacement updater:", run.stderr);
    // Clean up a possibly half-created replacement and stay in service.
    await exec(["docker", "rm", "-f", NEXT_CONTAINER]);
    return false;
  }

  console.log("[updater] Replacement updater started; stopping self...");
  state.phase = "self-updating";
  await saveState(state);

  // Single fire-and-forget call: the daemon completes the stop even if the
  // client (us) is killed by it.
  new Deno.Command("sh", {
    args: ["-c", `sleep 1; docker stop ${shellQuote(UPDATER_CONTAINER)} >/dev/null 2>&1`],
  }).output();

  await new Promise((r) => setTimeout(r, 2500));
  return true;
}

/**
 * Called from the replacement container on boot: verify that we are the
 * replacement, remove the old container and take over its name.
 */
export async function finalizeSwap(): Promise<void> {
  const nextInspect = await exec(["docker", "container", "inspect", NEXT_CONTAINER]);
  if (nextInspect.code !== 0) return; // no replacement container exists — nothing to take over

  let nextId = "";
  try {
    nextId = JSON.parse(nextInspect.stdout)[0]?.Id ?? "";
  } catch {
    return;
  }

  const selfId = await selfContainerId();
  // /etc/hostname holds the short (12-char) container ID; .Id is the full
  // 64-char one.
  if (!selfId || !nextId || !(nextId === selfId || nextId.startsWith(selfId))) {
    return; // we are not the replacement
  }

  console.log("[updater] Taking over container name from old updater...");
  await exec(["docker", "rm", "-f", UPDATER_CONTAINER]);
  await exec(["docker", "rename", NEXT_CONTAINER, UPDATER_CONTAINER]);
}
