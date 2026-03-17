import type { AnimationContext, AnimationLayer, LayerOutput } from "./types";

interface MotionClipDef {
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

  // References needed for on-demand VRMA loading
  // biome-ignore lint: complex THREE types
  private vrm: Record<string, unknown> | null = null;
  // biome-ignore lint: complex THREE types
  private loaderInstance: {
    loadAsync: (url: string) => Promise<{ userData: Record<string, unknown> }>;
  } | null = null;
  private createClipFn: VrmAnimationConverter | null = null;

  // biome-ignore lint: complex THREE types
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
        console.log(`[MotionClipLayer] Loaded manifest: ${data.clips.length} clips`);
      } else {
        console.error(
          `[MotionClipLayer] Failed to load manifest: ${res.status} ${res.statusText}. Motion clips will not be available.`
        );
      }
    } catch (err) {
      console.error("[MotionClipLayer] Failed to initialize VRMA loader:", err);
    }
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
        const clip = this.createClipFn(animations[0], this.vrm);
        this.clips.set(clipId, clip);
      }
    } catch (err) {
      console.warn(`[MotionClipLayer] Failed to load clip ${clipId}:`, err);
    } finally {
      this.loadingClips.delete(clipId);
    }
  }

  play(clipId: string, fadeIn = 0.3): void {
    const clip = this.clips.get(clipId);
    if (!clip || !this.mixer) return;

    if (this.currentAction) {
      this.currentAction.fadeOut(0.3);
    }

    const action = this.mixer.clipAction(clip);
    const def = this.manifest.find((c) => c.id === clipId);
    if (def && !def.loop) {
      action.setLoop(2200, 1); // THREE.LoopOnce = 2200
      action.clampWhenFinished = true;
    }
    action.reset().fadeIn(fadeIn).play();
    this.currentAction = action;
    this.isPlaying = true;
  }

  update(delta: number, context: AnimationContext): LayerOutput {
    // Check for new action from context
    const actionId = context.action;
    if (actionId && actionId !== this.pendingAction) {
      this.pendingAction = actionId;
      // Increment request counter to handle rapid action switches
      const requestId = ++this.requestCounter;
      if (this.clips.has(actionId)) {
        this.play(actionId);
      } else {
        // On-demand load then play — only if still the current request
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

    // Check if action finished
    if (this.currentAction && !this.currentAction.isRunning()) {
      this.isPlaying = false;
      this.currentAction = null;
    }

    return {
      lockedBones: this.isPlaying ? MOTION_CLIP_BONES : undefined,
    };
  }

  reset(): void {
    this.mixer?.stopAllAction();
    this.currentAction = null;
    this.isPlaying = false;
    this.pendingAction = null;
  }
}
