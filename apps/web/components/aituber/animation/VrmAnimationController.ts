/**
 * VRM Animation State Machine
 *
 * State diagram:
 *
 *   INIT ──(init() completes)──► IDLE ◄──(clip finished)── ACTION
 *                                 │                          ▲
 *                                 └──(playAction())──────────┘
 *
 * Any state can be PAUSED (animation frozen, update() is no-op).
 * playAction() and returnToIdle() auto-unpause.
 *
 * Design invariants:
 *  - init() is idempotent — safe to call multiple times
 *  - All async methods check `disposed` after every await
 *  - Loader (GLTFLoader + VRMAnimationLoaderPlugin) is created once and shared
 *  - Action clips are cached after first load
 *  - Previous actions are cleaned up after crossfade to prevent mixer bloat
 */

import * as THREE from "three";

export interface AnimationClipDef {
  id: string;
  file: string;
  category: string;
  description?: string;
  duration: number;
  loop: boolean;
}

type State = "init" | "idle" | "action";

const CROSSFADE_DURATION = 0.4;
const IDLE_SWITCH_MIN = 4;
const IDLE_SWITCH_MAX = 8;

// ---------------------------------------------------------------------------
// Loader singleton (shared across all controller instances)
// ---------------------------------------------------------------------------

let loaderPromise: Promise<LoaderKit> | null = null;

interface LoaderKit {
  loader: InstanceType<typeof import("three/examples/jsm/loaders/GLTFLoader.js").GLTFLoader>;
  createClip: typeof import("@pixiv/three-vrm-animation").createVRMAnimationClip;
}

function getLoader(): Promise<LoaderKit> {
  if (!loaderPromise) {
    loaderPromise = (async () => {
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { VRMAnimationLoaderPlugin, createVRMAnimationClip } = await import(
        "@pixiv/three-vrm-animation"
      );
      const loader = new GLTFLoader();
      loader.register((parser: unknown) => new VRMAnimationLoaderPlugin(parser as never));
      return { loader, createClip: createVRMAnimationClip };
    })();
  }
  return loaderPromise;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class VrmAnimationController {
  private state: State = "init";
  private disposed = false;
  private paused = false;

  // biome-ignore lint/suspicious/noExplicitAny: VRM type not exported
  private readonly vrm: any;
  private readonly mixer: THREE.AnimationMixer;

  private clipDefs: AnimationClipDef[] = [];
  private readonly idleClips = new Map<string, THREE.AnimationClip>();
  private readonly actionClipCache = new Map<string, THREE.AnimationClip>();

  private currentAction: THREE.AnimationAction | null = null;
  private currentIdleId: string | null = null;
  private idleTimer = 0;
  private nextIdleSwitch = 0;
  private pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  // biome-ignore lint/suspicious/noExplicitAny: VRM type not exported
  constructor(vrm: any, mixer: THREE.AnimationMixer) {
    this.vrm = vrm;
    this.mixer = mixer;
    this.mixer.addEventListener("finished", this.onFinished);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Load idle clips and start the idle loop. Idempotent. */
  async init(clipDefs: AnimationClipDef[]): Promise<void> {
    // Idempotent: skip if already initialized or currently loading
    if (this.state !== "init") return;

    this.clipDefs = clipDefs;
    const idleDefs = clipDefs.filter((c) => c.category === "idle");
    if (idleDefs.length === 0) return;

    const kit = await getLoader();
    if (this.disposed) return;

    const results = await Promise.allSettled(idleDefs.map((def) => this.fetchClip(kit, def)));
    if (this.disposed) return;

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        this.idleClips.set(r.value.name, r.value);
      } else if (r.status === "rejected") {
        console.warn("[VrmAnimationController] idle clip failed:", r.reason);
      }
    }

    if (this.idleClips.size > 0) {
      this.enterIdle();
    }
  }

  /** Play a non-idle clip. Loads on demand and caches. Auto-unpauses. */
  async playAction(clipId: string): Promise<void> {
    const def = this.clipDefs.find((c) => c.id === clipId);
    if (!def) return;

    let clip: THREE.AnimationClip | undefined = this.actionClipCache.get(clipId);
    if (!clip) {
      const kit = await getLoader();
      if (this.disposed) return;
      const loaded = await this.fetchClip(kit, def);
      if (!loaded || this.disposed) return;
      clip = loaded;
      this.actionClipCache.set(clipId, clip);
    }

    this.paused = false;
    this.state = "action";

    const action = this.mixer.clipAction(clip);
    action.clampWhenFinished = true;
    action.setLoop(def.loop ? THREE.LoopRepeat : THREE.LoopOnce, def.loop ? Infinity : 1);
    this.crossFadeTo(action);
  }

  /** Return to the idle loop. Auto-unpauses. No-op if already idle and not paused. */
  returnToIdle(): void {
    if (this.state === "idle" && !this.paused) return;
    this.paused = false;
    this.enterIdle();
  }

  /** Freeze animation. Current action fades out, update() becomes no-op. */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.currentAction?.fadeOut(CROSSFADE_DURATION);
  }

  /** Unfreeze animation. Resumes idle if in idle state. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.state === "idle") {
      this.enterIdle();
    }
  }

  /** Per-frame tick. Drives mixer + idle clip rotation. */
  update(delta: number): void {
    if (this.paused) return;
    this.mixer.update(delta);

    if (this.state === "idle") {
      this.idleTimer += delta;
      if (this.idleTimer >= this.nextIdleSwitch) {
        this.playRandomIdle();
      }
    }
  }

  getState(): State {
    return this.state;
  }

  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Returns the effective weight (0-1) of the current *action* clip.
   * Idle clips return 0 so the compositor's procedural breathing and
   * micro-movements remain active during idle — only suppressed when a
   * specific action clip (greeting, think, etc.) overrides the bones.
   */
  getClipWeight(): number {
    if (this.paused || !this.currentAction || this.state !== "action") return 0;
    return this.currentAction.getEffectiveWeight();
  }

  /** Release all resources. Safe to call multiple times. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const timer of this.pendingTimers) clearTimeout(timer);
    this.pendingTimers.clear();
    this.mixer.removeEventListener("finished", this.onFinished);
    this.mixer.stopAllAction();
    this.currentAction = null;
    this.idleClips.clear();
    this.actionClipCache.clear();
  }

  // -----------------------------------------------------------------------
  // Private — state transitions
  // -----------------------------------------------------------------------

  private enterIdle(): void {
    this.state = "idle";
    this.resetIdleTimer();
    this.playRandomIdle();
  }

  private playRandomIdle(): void {
    const ids = [...this.idleClips.keys()];
    if (ids.length === 0) return;

    // Pick a clip different from the current one
    let nextId = ids[0] as string;
    if (ids.length > 1) {
      do {
        nextId = ids[Math.floor(Math.random() * ids.length)] as string;
      } while (nextId === this.currentIdleId);
    }

    const clip = this.idleClips.get(nextId);
    if (!clip) return;

    const action = this.mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    this.crossFadeTo(action);

    this.currentIdleId = nextId;
    this.resetIdleTimer();
  }

  // -----------------------------------------------------------------------
  // Private — crossfade helper
  // -----------------------------------------------------------------------

  private crossFadeTo(next: THREE.AnimationAction): void {
    const prev = this.currentAction;

    // Prepare next action WITHOUT reset() — reset() forces effectiveWeight
    // to 1 which defeats the crossFadeFrom weight interpolation.
    next.time = 0;
    next.enabled = true;
    next.setEffectiveTimeScale(1);

    if (prev && prev !== next) {
      // crossFadeFrom handles weight interpolation: prev 1→0, next 0→1
      next.crossFadeFrom(prev, CROSSFADE_DURATION, true);

      // Clean up previous action after crossfade completes
      const clipToUncache = prev.getClip();
      const prevRef = prev;
      const timer = setTimeout(
        () => {
          this.pendingTimers.delete(timer);
          if (this.disposed) return;
          prevRef.stop();
          this.mixer.uncacheAction(clipToUncache);
        },
        CROSSFADE_DURATION * 1000 + 100
      );
      this.pendingTimers.add(timer);
    } else {
      // No previous action — set weight directly
      next.setEffectiveWeight(1);
    }

    next.play();
    this.currentAction = next;
  }

  // -----------------------------------------------------------------------
  // Private — clip loading
  // -----------------------------------------------------------------------

  private async fetchClip(
    kit: LoaderKit,
    def: AnimationClipDef
  ): Promise<THREE.AnimationClip | null> {
    try {
      const gltf = await kit.loader.loadAsync(`/motions/${def.file}`);
      const vrmAnimation = gltf.userData.vrmAnimations?.[0];
      if (!vrmAnimation) return null;

      const clip = kit.createClip(vrmAnimation, this.vrm);
      clip.name = def.id;
      return clip;
    } catch (err) {
      console.error("[VrmAnimationController] Failed to load:", def.id, err);
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Private — utilities
  // -----------------------------------------------------------------------

  private resetIdleTimer(): void {
    this.idleTimer = 0;
    this.nextIdleSwitch = IDLE_SWITCH_MIN + Math.random() * (IDLE_SWITCH_MAX - IDLE_SWITCH_MIN);
  }

  private onFinished = (event: { action: THREE.AnimationAction }): void => {
    if (this.state !== "action") return;
    if (event.action !== this.currentAction) return;
    this.enterIdle();
  };
}
