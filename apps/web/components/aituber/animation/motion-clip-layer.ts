import type { AnimationContext, AnimationLayer, LayerOutput } from "./types";

export interface MotionClipDef {
  id: string;
  file: string;
  category: string;
  description: string;
  tags: string[];
  duration: number;
  loop: boolean;
}

interface ThreeAnimationMixer {
  clipAction: (clip: unknown) => ThreeAnimationAction;
  stopAllAction: () => void;
  update: (delta: number) => void;
}

interface ThreeAnimationAction {
  reset: () => ThreeAnimationAction;
  fadeIn: (duration: number) => ThreeAnimationAction;
  fadeOut: (duration: number) => ThreeAnimationAction;
  setLoop: (mode: number, count: number) => ThreeAnimationAction;
  play: () => ThreeAnimationAction;
  isRunning: () => boolean;
  clampWhenFinished: boolean;
}

// Upper body bones that motion clips typically control
const MOTION_CLIP_BONES = new Set([
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "hips",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
]);

// Minimum pause between idle clips (seconds)
const IDLE_MIN_PAUSE = 1.0;
// Maximum additional random pause (seconds)
const IDLE_RANDOM_PAUSE = 3.0;

type VrmAnimationConverter = (animation: unknown, vrm: unknown) => unknown;

export class MotionClipLayer implements AnimationLayer {
  private mixer: ThreeAnimationMixer | null = null;
  private clips = new Map<string, unknown>();
  private loadingClips = new Set<string>();
  private currentAction: ThreeAnimationAction | null = null;
  private isPlaying = false;
  private manifest: MotionClipDef[] = [];
  private pendingAction: string | null = null;
  private requestCounter = 0;

  // Idle auto-play state
  private idleClipIds: string[] = [];
  private lastIdleIndex = -1;
  private idleCooldown = 0;
  private idlePreloaded = false;
  private isIdleClip = false;

  // References needed for on-demand VRMA loading
  private vrm: Record<string, unknown> | null = null;
  private loaderInstance: {
    loadAsync: (url: string) => Promise<{ userData: Record<string, unknown> }>;
  } | null = null;
  private createClipFn: VrmAnimationConverter | null = null;
  private hipsRestPosition: { x: number; y: number; z: number } | null = null;

  async initialize(
    vrm: Record<string, unknown>,
    THREE: Record<string, unknown>,
    basePath = "/motions"
  ): Promise<void> {
    const AnimationMixerCtor = (
      THREE as { AnimationMixer: new (root: unknown) => ThreeAnimationMixer }
    ).AnimationMixer;
    const vrmScene = (vrm as { scene: unknown }).scene;
    this.mixer = new AnimationMixerCtor(vrmScene);
    this.vrm = vrm;

    // Capture hips bone rest position for translation correction
    const humanoid = (
      vrm as {
        humanoid?: {
          getNormalizedBoneNode: (
            name: string
          ) => { position: { x: number; y: number; z: number } } | null;
        };
      }
    ).humanoid;
    const hipsNode = humanoid?.getNormalizedBoneNode("hips");
    if (hipsNode) {
      const p = hipsNode.position;
      this.hipsRestPosition = { x: p.x, y: p.y, z: p.z };
      console.log(
        `[MotionClipLayer] Hips rest position: [${p.x.toFixed(3)}, ${p.y.toFixed(3)}, ${p.z.toFixed(3)}]`
      );
    }

    // Set up VRMA loader
    try {
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { VRMAnimationLoaderPlugin, createVRMAnimationClip } = await import(
        "@pixiv/three-vrm-animation"
      );

      const loader = new GLTFLoader();
      loader.register((parser: unknown) => new VRMAnimationLoaderPlugin(parser as never));
      this.loaderInstance = loader;
      this.createClipFn = createVRMAnimationClip as VrmAnimationConverter;

      // Fetch manifest
      const res = await fetch(`${basePath}/manifest.json`);
      if (res.ok) {
        const data = (await res.json()) as { clips: MotionClipDef[] };
        this.manifest = data.clips;
        this.idleClipIds = data.clips.filter((c) => c.category === "idle").map((c) => c.id);
        console.log(
          `[MotionClipLayer] Loaded manifest: ${data.clips.length} clips (${this.idleClipIds.length} idle)`
        );

        // Pre-load idle clips so they're ready immediately
        void this.preloadIdleClips();
      } else {
        console.error(
          `[MotionClipLayer] Failed to load manifest: ${res.status} ${res.statusText}. Motion clips will not be available.`
        );
      }
    } catch (err) {
      console.error("[MotionClipLayer] Failed to initialize VRMA loader:", err);
    }
  }

  private async preloadIdleClips(): Promise<void> {
    await Promise.all(this.idleClipIds.map((id) => this.loadClipOnDemand(id)));
    this.idlePreloaded = true;
    // Start first idle clip right away
    this.idleCooldown = 0;
  }

  setManifest(manifest: MotionClipDef[]): void {
    this.manifest = manifest;
  }

  addClip(id: string, clip: unknown): void {
    this.clips.set(id, clip);
  }

  private async loadClipOnDemand(clipId: string): Promise<void> {
    if (this.clips.has(clipId) || this.loadingClips.has(clipId)) return;
    if (!this.loaderInstance || !this.createClipFn || !this.vrm) return;

    const def = this.manifest.find((c) => c.id === clipId);
    if (!def) return;

    this.loadingClips.add(clipId);
    try {
      const gltf = await this.loaderInstance.loadAsync(`/motions/${def.file}`);
      const animations = gltf.userData.vrmAnimations as unknown[] | undefined;
      if (animations?.[0]) {
        const clip = this.createClipFn(animations[0], this.vrm) as {
          tracks: { name: string; values: Float32Array; times: Float32Array }[];
        };
        // Fix: VRMA source files have hips translation in SMPL world-space,
        // but the VRMA node rest pose is in bone-local space. This causes
        // createVRMAnimationClip to compute a huge incorrect delta.
        // Correct by making the hips position track relative to its first frame.
        this.correctHipsTranslation(clip);
        this.clips.set(clipId, clip);
      }
    } catch (err) {
      console.warn(`[MotionClipLayer] Failed to load clip ${clipId}:`, err);
    } finally {
      this.loadingClips.delete(clipId);
    }
  }

  /**
   * VRMA files generated from SMPL-H have hips translation in world-space
   * (Y ≈ 1.0 = pelvis height from ground), but the VRMA node rest pose stores
   * bone-local coordinates (Y ≈ -0.19). createVRMAnimationClip computes
   * delta = anim - restPose, producing a ~1.2m upward offset.
   *
   * Fix: replace track values with  restPosition + (frame - frame[0])
   * so that frame 0 = rest position, and subsequent frames carry only
   * the relative motion (a few cm for bows/shifts).
   */
  private correctHipsTranslation(clip: {
    tracks: { name: string; values: Float32Array; times: Float32Array }[];
  }): void {
    const track = clip.tracks.find((t) => t.name.endsWith(".position"));
    if (!track || track.values.length < 3 || !this.hipsRestPosition) return;

    const baseX = track.values[0] ?? 0;
    const baseY = track.values[1] ?? 0;
    const baseZ = track.values[2] ?? 0;
    const rest = this.hipsRestPosition;

    const vals = track.values;
    for (let i = 0; i < vals.length; i += 3) {
      vals[i] = rest.x + ((vals[i] ?? 0) - baseX);
      vals[i + 1] = rest.y + ((vals[i + 1] ?? 0) - baseY);
      vals[i + 2] = rest.z + ((vals[i + 2] ?? 0) - baseZ);
    }

    console.log(
      `[MotionClipLayer] Corrected hips translation: base [${baseX.toFixed(3)}, ${baseY.toFixed(3)}, ${baseZ.toFixed(3)}] → rest [${rest.x.toFixed(3)}, ${rest.y.toFixed(3)}, ${rest.z.toFixed(3)}]`
    );
  }

  play(clipId: string, fadeIn = 0.3): void {
    const clip = this.clips.get(clipId);
    if (!clip || !this.mixer) return;

    // Stop previous action fully to clear residual transforms (especially hip translations)
    if (this.currentAction) {
      this.currentAction.fadeOut(0.3);
    }

    const action = this.mixer.clipAction(clip);
    const def = this.manifest.find((c) => c.id === clipId);
    if (def && !def.loop) {
      action.setLoop(2200, 1); // THREE.LoopOnce = 2200
      // Do NOT set clampWhenFinished — it causes hip translations to persist and accumulate
      action.clampWhenFinished = false;
    }
    action.reset().fadeIn(fadeIn).play();
    this.currentAction = action;
    this.isPlaying = true;
  }

  private pickNextIdleClip(): string | null {
    if (this.idleClipIds.length === 0) return null;
    // Avoid repeating the same clip consecutively
    let idx: number;
    if (this.idleClipIds.length === 1) {
      idx = 0;
    } else {
      do {
        idx = Math.floor(Math.random() * this.idleClipIds.length);
      } while (idx === this.lastIdleIndex);
    }
    this.lastIdleIndex = idx;
    // idx is always valid because it's bounded by idleClipIds.length
    return this.idleClipIds[idx] as string;
  }

  update(delta: number, context: AnimationContext): LayerOutput {
    // Check for new action from context (explicit actions override idle)
    const actionId = context.action;
    if (actionId && actionId !== this.pendingAction) {
      this.pendingAction = actionId;
      this.isIdleClip = false;
      const requestId = ++this.requestCounter;
      if (this.clips.has(actionId)) {
        this.play(actionId);
      } else {
        void this.loadClipOnDemand(actionId).then(() => {
          if (this.requestCounter === requestId && this.clips.has(actionId)) {
            this.play(actionId);
          }
        });
      }
    } else if (!actionId) {
      this.pendingAction = null;
    }

    this.mixer?.update(delta);

    // Check if current action finished
    if (this.currentAction && !this.currentAction.isRunning()) {
      // Stop all actions to fully clear residual bone transforms (position/rotation)
      // so they don't accumulate across clips
      this.mixer?.stopAllAction();
      this.isPlaying = false;
      this.currentAction = null;
      // After an idle clip ends, schedule the next one with a random pause
      if (this.isIdleClip) {
        this.idleCooldown = IDLE_MIN_PAUSE + Math.random() * IDLE_RANDOM_PAUSE;
      }
      this.isIdleClip = false;
    }

    // Auto-play idle clips when nothing is happening
    if (
      !this.isPlaying &&
      !this.pendingAction &&
      this.idlePreloaded &&
      context.avatarState === "idle"
    ) {
      this.idleCooldown -= delta;
      if (this.idleCooldown <= 0) {
        const nextIdle = this.pickNextIdleClip();
        if (nextIdle && this.clips.has(nextIdle)) {
          this.play(nextIdle, 0.5);
          this.isIdleClip = true;
        }
      }
    }

    return {
      lockedBones: this.isPlaying ? MOTION_CLIP_BONES : undefined,
    };
  }

  reset(): void {
    this.mixer?.stopAllAction();
    this.currentAction = null;
    this.isPlaying = false;
    this.isIdleClip = false;
    this.pendingAction = null;
    this.idleCooldown = 0;
  }
}
