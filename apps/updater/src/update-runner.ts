import { join } from "node:path";
import { composeDownloadUrl, fetchLatestRelease } from "./github.ts";
import {
  getState,
  loadState,
  makeSteps,
  resetState,
  saveState,
  type UpdaterState,
} from "./state.ts";

const INSTALL_DIR = Deno.env.get("INSTALL_DIR") ?? "/opt/echolore";

async function exec(
  cmd: string[],
  opts?: { cwd?: string }
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    cwd: opts?.cwd ?? INSTALL_DIR,
    stdout: "piped",
    stderr: "piped",
  });
  const output = await proc.output();
  return {
    code: output.code,
    stdout: new TextDecoder().decode(output.stdout),
    stderr: new TextDecoder().decode(output.stderr),
  };
}

function envPath(): string {
  return join(INSTALL_DIR, ".env");
}
function composePath(): string {
  return join(INSTALL_DIR, "docker-compose.yml");
}

async function readCurrentVersion(): Promise<string> {
  try {
    const content = await Deno.readTextFile(envPath());
    const match = content.match(/^ECHOLORE_VERSION=(.+)$/m);
    return match?.[1]?.trim() ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function setStep(
  state: UpdaterState,
  index: number,
  status: "running" | "done" | "failed",
  message?: string
): Promise<void> {
  state.currentStep = index;
  state.steps[index].status = status;
  if (message) state.steps[index].message = message;
  await saveState(state);
}

async function failUpdate(state: UpdaterState, stepIndex: number, error: string): Promise<void> {
  state.steps[stepIndex].status = "failed";
  state.steps[stepIndex].message = error;
  state.phase = "failed";
  state.error = error;
  await saveState(state);
}

async function rollback(state: UpdaterState): Promise<void> {
  console.error("[updater] Rolling back...");
  const prevCompose = join(INSTALL_DIR, "docker-compose.yml.prev");

  try {
    // Restore compose file
    try {
      await Deno.stat(prevCompose);
      await Deno.copyFile(prevCompose, composePath());
    } catch {
      /* no prev file */
    }

    // Restore .env version
    if (state.previousVersion && state.previousVersion !== "unknown") {
      const envContent = await Deno.readTextFile(envPath());
      const updated = envContent.replace(
        /^ECHOLORE_VERSION=.*/m,
        `ECHOLORE_VERSION=${state.previousVersion}`
      );
      await Deno.writeTextFile(envPath(), updated);
    }

    await exec(["docker", "compose", "pull"]);
    await exec(["docker", "compose", "up", "-d", "--remove-orphans"]);
  } catch (e) {
    console.error("[updater] Rollback error:", e);
  }
}

export async function getCurrentVersion(): Promise<string> {
  return await readCurrentVersion();
}

export function isUpdateInProgress(): boolean {
  const s = getState();
  return s.phase === "updating-services" || s.phase === "self-updating";
}

export async function startUpdate(targetVersion?: string): Promise<{
  success: boolean;
  message: string;
  targetVersion: string;
}> {
  const currentState = getState();
  if (currentState.phase === "updating-services" || currentState.phase === "self-updating") {
    return {
      success: false,
      message: "An update is already in progress",
      targetVersion: currentState.targetVersion,
    };
  }

  const currentVersion = await readCurrentVersion();

  // Resolve target version
  let resolvedVersion = targetVersion ?? "";
  if (!resolvedVersion) {
    try {
      const release = await fetchLatestRelease();
      resolvedVersion = release.version;
    } catch (e) {
      return {
        success: false,
        message: `Failed to fetch latest version: ${e}`,
        targetVersion: "",
      };
    }
  }

  if (resolvedVersion === currentVersion) {
    return {
      success: false,
      message: `Already at version ${currentVersion}`,
      targetVersion: resolvedVersion,
    };
  }

  // Start the update in background
  const state: UpdaterState = {
    phase: "updating-services",
    targetVersion: resolvedVersion,
    previousVersion: currentVersion,
    startedAt: new Date().toISOString(),
    steps: makeSteps(),
    currentStep: 0,
  };
  await saveState(state);

  // Run update asynchronously
  runUpdate(state).catch((e) => {
    console.error("[updater] Unhandled update error:", e);
  });

  return {
    success: true,
    message: `Update started: ${currentVersion} → ${resolvedVersion}`,
    targetVersion: resolvedVersion,
  };
}

async function runUpdate(state: UpdaterState): Promise<void> {
  try {
    // Step 0: fetch_release (already resolved, mark done)
    await setStep(state, 0, "done", `Target: ${state.targetVersion}`);

    // Step 1: download_compose
    await setStep(state, 1, "running", "Downloading compose file...");
    const composeUrl = composeDownloadUrl(state.targetVersion);
    const resp = await fetch(composeUrl);
    if (!resp.ok) {
      await failUpdate(state, 1, `Failed to download compose: ${resp.status}`);
      await rollback(state);
      return;
    }
    const newCompose = await resp.text();

    // Validate compose file
    const tmpCompose = join(INSTALL_DIR, "docker-compose.yml.new");
    await Deno.writeTextFile(tmpCompose, newCompose);
    const validate = await exec(["docker", "compose", "-f", tmpCompose, "config", "-q"]);
    if (validate.code !== 0) {
      await Deno.remove(tmpCompose);
      await failUpdate(state, 1, "Downloaded compose file is invalid");
      return;
    }
    await setStep(state, 1, "done");

    // Step 2: backup
    await setStep(state, 2, "running", "Backing up...");
    const suffix = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    await Deno.copyFile(envPath(), join(INSTALL_DIR, `.env.backup.${suffix}`));
    await Deno.copyFile(composePath(), join(INSTALL_DIR, "docker-compose.yml.prev"));
    await setStep(state, 2, "done");

    // Step 3: self_update_check
    await setStep(state, 3, "running", "Checking updater image...");
    // Read current updater image from running compose
    const currentCompose = await Deno.readTextFile(composePath());
    const currentUpdaterMatch = currentCompose.match(/^\s*image:\s*(.+updater.+)$/m);
    const newUpdaterMatch = newCompose.match(/^\s*image:\s*(.+updater.+)$/m);

    if (
      currentUpdaterMatch &&
      newUpdaterMatch &&
      currentUpdaterMatch[1].trim() !== newUpdaterMatch[1].trim()
    ) {
      // Self-update needed
      await setStep(state, 3, "running", "Self-updating...");
      state.phase = "self-updating";
      await saveState(state);

      // Place new compose file
      await Deno.rename(tmpCompose, composePath());

      // Update .env version first so the updater image tag resolves
      const envContent = await Deno.readTextFile(envPath());
      if (envContent.match(/^ECHOLORE_VERSION=/m)) {
        await Deno.writeTextFile(
          envPath(),
          envContent.replace(/^ECHOLORE_VERSION=.*/m, `ECHOLORE_VERSION=${state.targetVersion}`)
        );
      } else {
        await Deno.writeTextFile(
          envPath(),
          `${envContent}\nECHOLORE_VERSION=${state.targetVersion}\n`
        );
      }

      // Pull only updater image and restart self
      await exec(["docker", "compose", "pull", "updater"]);
      // This will kill our own process - the new container will resume from state file
      await exec(["docker", "compose", "up", "-d", "--no-deps", "updater"]);
      return;
    }

    // No self-update needed
    await setStep(state, 3, "done", "No self-update needed");

    // Place new compose file
    await Deno.rename(tmpCompose, composePath());

    // Step 4: update_env
    await setStep(state, 4, "running", "Updating version...");
    const envContent = await Deno.readTextFile(envPath());
    if (envContent.match(/^ECHOLORE_VERSION=/m)) {
      await Deno.writeTextFile(
        envPath(),
        envContent.replace(/^ECHOLORE_VERSION=.*/m, `ECHOLORE_VERSION=${state.targetVersion}`)
      );
    } else {
      await Deno.writeTextFile(
        envPath(),
        `${envContent}\nECHOLORE_VERSION=${state.targetVersion}\n`
      );
    }
    await setStep(state, 4, "done");

    // Step 5: pull_images
    await setStep(state, 5, "running", "Pulling images...");
    const pull = await exec(["docker", "compose", "pull"]);
    if (pull.code !== 0) {
      await failUpdate(state, 5, `docker compose pull failed: ${pull.stderr}`);
      await rollback(state);
      return;
    }
    await setStep(state, 5, "done");

    // Step 6: restart_services
    await setStep(state, 6, "running", "Restarting services...");
    const up = await exec(["docker", "compose", "up", "-d", "--remove-orphans"]);
    if (up.code !== 0) {
      await failUpdate(state, 6, `docker compose up failed: ${up.stderr}`);
      await rollback(state);
      return;
    }
    await setStep(state, 6, "done");

    // Step 7: health_check
    await setStep(state, 7, "running", "Waiting for services...");
    const healthy = await waitForHealth(120);
    if (!healthy) {
      await failUpdate(state, 7, "Health check timed out");
      await rollback(state);
      return;
    }
    await setStep(state, 7, "done");

    // Cleanup
    try {
      await Deno.remove(join(INSTALL_DIR, "docker-compose.yml.prev"));
    } catch {
      /* ok */
    }

    state.phase = "complete";
    await saveState(state);
    console.log(`[updater] Update complete: ${state.previousVersion} → ${state.targetVersion}`);
  } catch (e) {
    state.phase = "failed";
    state.error = String(e);
    await saveState(state);
    console.error("[updater] Update failed:", e);
    await rollback(state);
  }
}

/**
 * Resume after self-update: new updater container starts, checks state file,
 * and continues from step 4 (update_env was already done during self-update).
 */
export async function resumeAfterSelfUpdate(): Promise<void> {
  const state = await loadState();
  if (state.phase !== "self-updating") return;

  console.log("[updater] Resuming after self-update...");
  state.phase = "updating-services";
  await setStep(state, 3, "done", "Self-update completed");

  // .env and compose already updated during self-update phase
  await setStep(state, 4, "done", "Already updated during self-update");

  // Step 5: pull remaining images
  await setStep(state, 5, "running", "Pulling images...");
  const pull = await exec(["docker", "compose", "pull"]);
  if (pull.code !== 0) {
    await failUpdate(state, 5, `docker compose pull failed: ${pull.stderr}`);
    await rollback(state);
    return;
  }
  await setStep(state, 5, "done");

  // Step 6: restart services
  await setStep(state, 6, "running", "Restarting services...");
  const up = await exec(["docker", "compose", "up", "-d", "--remove-orphans"]);
  if (up.code !== 0) {
    await failUpdate(state, 6, `docker compose up failed: ${up.stderr}`);
    await rollback(state);
    return;
  }
  await setStep(state, 6, "done");

  // Step 7: health check
  await setStep(state, 7, "running", "Waiting for services...");
  const healthy = await waitForHealth(120);
  if (!healthy) {
    await failUpdate(state, 7, "Health check timed out");
    await rollback(state);
    return;
  }
  await setStep(state, 7, "done");

  try {
    await Deno.remove(join(INSTALL_DIR, "docker-compose.yml.prev"));
  } catch {
    /* ok */
  }

  state.phase = "complete";
  await saveState(state);
  console.log(`[updater] Update complete: ${state.previousVersion} → ${state.targetVersion}`);
}

async function waitForHealth(timeoutSeconds: number): Promise<boolean> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    try {
      const result = await exec([
        "docker",
        "compose",
        "exec",
        "-T",
        "api",
        "wget",
        "--no-verbose",
        "--tries=1",
        "--spider",
        "http://localhost:3001/health",
      ]);
      if (result.code === 0) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return false;
}

export async function triggerRollback(): Promise<{
  success: boolean;
  message: string;
}> {
  const state = getState();
  if (state.phase !== "failed" && state.phase !== "complete") {
    return { success: false, message: "No completed/failed update to rollback" };
  }

  if (!state.previousVersion || state.previousVersion === "unknown") {
    return { success: false, message: "No previous version to rollback to" };
  }

  await resetState();

  const prevCompose = join(INSTALL_DIR, "docker-compose.yml.prev");
  try {
    await Deno.stat(prevCompose);
    await Deno.copyFile(prevCompose, composePath());
  } catch {
    /* no prev file, proceed with current compose */
  }

  const envContent = await Deno.readTextFile(envPath());
  await Deno.writeTextFile(
    envPath(),
    envContent.replace(/^ECHOLORE_VERSION=.*/m, `ECHOLORE_VERSION=${state.previousVersion}`)
  );

  await exec(["docker", "compose", "pull"]);
  await exec(["docker", "compose", "up", "-d", "--remove-orphans"]);

  return {
    success: true,
    message: `Rolled back to ${state.previousVersion}`,
  };
}
