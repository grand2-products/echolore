import { fetchLatestRelease } from "./github.ts";
import { getState } from "./state.ts";
import {
  getCurrentVersion,
  isUpdateInProgress,
  startUpdate,
  triggerRollback,
} from "./update-runner.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleHealth(): Promise<Response> {
  return json({ status: "ok", timestamp: new Date().toISOString() });
}

export async function handleStatus(): Promise<Response> {
  const currentVersion = await getCurrentVersion();
  return json({
    currentVersion,
    updaterAvailable: true,
    updateInProgress: isUpdateInProgress(),
  });
}

export async function handleCheck(): Promise<Response> {
  const currentVersion = await getCurrentVersion();
  try {
    const release = await fetchLatestRelease();
    return json({
      currentVersion,
      latestVersion: release.version,
      updateAvailable: release.version !== currentVersion,
      releaseUrl: release.releaseUrl,
      releaseNotes: release.releaseNotes,
      publishedAt: release.publishedAt,
    });
  } catch (e) {
    return json({ error: "GITHUB_API_ERROR", message: String(e) }, 502);
  }
}

export async function handleUpdate(request: Request): Promise<Response> {
  let body: { targetVersion?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is ok
  }

  const result = await startUpdate(body.targetVersion);
  return json(result, result.success ? 200 : 409);
}

export async function handleProgress(): Promise<Response> {
  const state = getState();
  return json({
    phase: state.phase,
    targetVersion: state.targetVersion,
    previousVersion: state.previousVersion,
    startedAt: state.startedAt,
    steps: state.steps,
    currentStep: state.currentStep,
    error: state.error,
  });
}

export async function handleRollback(): Promise<Response> {
  const result = await triggerRollback();
  return json(result, result.success ? 200 : 409);
}
