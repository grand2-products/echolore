import { join } from "node:path";

const INSTALL_DIR = Deno.env.get("INSTALL_DIR") ?? "/opt/echolore";
const STATE_FILE = join(INSTALL_DIR, ".updater-state.json");

export type UpdatePhase = "idle" | "self-updating" | "updating-services" | "complete" | "failed";

export type StepStatus = "pending" | "running" | "done" | "failed";

export interface UpdateStep {
  name: string;
  status: StepStatus;
  message?: string;
}

export interface UpdaterState {
  phase: UpdatePhase;
  targetVersion: string;
  previousVersion: string;
  startedAt: string | null;
  steps: UpdateStep[];
  currentStep: number;
  error?: string;
}

const DEFAULT_STATE: UpdaterState = {
  phase: "idle",
  targetVersion: "",
  previousVersion: "",
  startedAt: null,
  steps: [],
  currentStep: 0,
};

let cachedState: UpdaterState = { ...DEFAULT_STATE };

export function getState(): UpdaterState {
  return cachedState;
}

export async function loadState(): Promise<UpdaterState> {
  try {
    const raw = await Deno.readTextFile(STATE_FILE);
    cachedState = JSON.parse(raw);
  } catch {
    cachedState = { ...DEFAULT_STATE };
  }
  return cachedState;
}

export async function saveState(state: UpdaterState): Promise<void> {
  cachedState = state;
  await Deno.writeTextFile(STATE_FILE, JSON.stringify(state, null, 2));
}

export async function resetState(): Promise<void> {
  await saveState({ ...DEFAULT_STATE });
}

export function makeSteps(): UpdateStep[] {
  return [
    { name: "fetch_release", status: "pending" },
    { name: "download_compose", status: "pending" },
    { name: "backup", status: "pending" },
    { name: "self_update_check", status: "pending" },
    { name: "update_env", status: "pending" },
    { name: "pull_images", status: "pending" },
    { name: "restart_services", status: "pending" },
    { name: "health_check", status: "pending" },
  ];
}
