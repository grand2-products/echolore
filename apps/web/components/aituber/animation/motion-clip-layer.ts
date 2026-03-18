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
  setTime: (time: number) => void;
  time: number;
}

interface ThreeAnimationAction {
  reset: () => ThreeAnimationAction;
  fadeIn: (duration: number) => ThreeAnimationAction;
  fadeOut: (duration: number) => ThreeAnimationAction;
  setLoop: (mode: number, count: number) => ThreeAnimationAction;
  play: () => ThreeAnimationAction;
  stop: () => ThreeAnimationAction;
  isRunning: () => boolean;
  clampWhenFinished: boolean;
  paused: boolean;
  time: number;
}

// Bones whose animation tracks are driven by VRMAs.
// While a clip is playing, the compositor skips these and lets the mixer control them.
const MOTION_CLIP_BONES = new Set([
  "hips",
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
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "leftToes",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "rightToes",
]);

// Rest pose quaternions for bones that differ from identity (T-pose).
// Must match RestPoseLayer so clip frame 0 = compositor rest state.
const REST_POSE_EULER: Record<string, { x: number; y: number; z: number }> = {
  leftUpperArm: { x: 0, y: 0, z: -1.15 },
  rightUpperArm: { x: 0, y: 0, z: 1.15 },
  leftLowerArm: { x: 0, y: 0, z: -0.12 },
  rightLowerArm: { x: 0, y: 0, z: 0.12 },
};

// Minimum pause between idle clips (seconds)
const IDLE_MIN_PAUSE = 1.0;
// Maximum additional random pause (seconds)
const IDLE_RANDOM_PAUSE = 3.0;

// -- Quaternion helpers (xyzw) --------------------------------------------

type Q = { x: number; y: number; z: number; w: number };

function qInv(q: Q): Q {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

function qMul(a: Q, b: Q): Q {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function qFromEulerXYZ(x: number, y: number, z: number): Q {
  const cx = Math.cos(x * 0.5),
    sx = Math.sin(x * 0.5);
  const cy = Math.cos(y * 0.5),
    sy = Math.sin(y * 0.5);
  const cz = Math.cos(z * 0.5),
    sz = Math.sin(z * 0.5);
  return {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  };
}

function qRead(arr: Float32Array, frame: number): Q {
  const o = frame * 4;
  return {
    x: arr[o] ?? 0,
    y: arr[o + 1] ?? 0,
    z: arr[o + 2] ?? 0,
    w: arr[o + 3] ?? 1,
  };
}

function qWrite(arr: Float32Array, frame: number, q: Q): void {
  const o = frame * 4;
  arr[o] = q.x;
  arr[o + 1] = q.y;
  arr[o + 2] = q.z;
  arr[o + 3] = q.w;
}

// -------------------------------------------------------------------------

interface VrmAnimRotationTrack {
  times: Float32Array;
  values: Float32Array;
}

interface VrmAnimationData {
  duration: number;
  restHipsPosition: { y: number };
  humanoidTracks: {
    translation: Map<string, { times: Float32Array; values: Float32Array }>;
    rotation: Map<string, VrmAnimRotationTrack>;
  };
}

interface VrmHumanoid {
  getNormalizedBoneNode: (name: string) => {
    name: string;
    quaternion: Q;
    position: { x: number; y: number; z: number };
  } | null;
  normalizedRestPose: {
    hips: { position: [number, number, number] };
  };
}

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
  private isSeeking = false;

  // References for on-demand VRMA loading
  private humanoid: VrmHumanoid | null = null;
  private loaderInstance: {
    loadAsync: (url: string) => Promise<{ userData: Record<string, unknown> }>;
  } | null = null;
  private threeMod: Record<string, unknown> | null = null;

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
    this.threeMod = THREE;
    this.humanoid = (vrm as { humanoid?: VrmHumanoid }).humanoid ?? null;

    try {
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { VRMAnimationLoaderPlugin } = await import("@pixiv/three-vrm-animation");

      const loader = new GLTFLoader();
      loader.register((parser: unknown) => new VRMAnimationLoaderPlugin(parser as never));
      this.loaderInstance = loader;

      const res = await fetch(`${basePath}/manifest.json`);
      if (res.ok) {
        const data = (await res.json()) as { clips: MotionClipDef[] };
        this.manifest = data.clips;
        this.idleClipIds = data.clips.filter((c) => c.category === "idle").map((c) => c.id);
        console.log(
          `[MotionClipLayer] Loaded manifest: ${data.clips.length} clips (${this.idleClipIds.length} idle)`
        );
        void this.preloadIdleClips();
      } else {
        console.error(`[MotionClipLayer] Failed to load manifest: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.error("[MotionClipLayer] Failed to initialize VRMA loader:", err);
    }
  }

  private async preloadIdleClips(): Promise<void> {
    await Promise.all(this.idleClipIds.map((id) => this.loadClipOnDemand(id)));
    this.idlePreloaded = true;
    this.idleCooldown = 0;
  }

  setManifest(manifest: MotionClipDef[]): void {
    this.manifest = manifest;
  }

  addClip(id: string, clip: unknown): void {
    this.clips.set(id, clip);
  }

  /**
   * Build a Three.js AnimationClip from parsed VRMAnimation data.
   *
   * VRMAnimationLoaderPlugin outputs rotation tracks as raw SMPL-H joint
   * quaternions (because the VRMA source nodes have identity rest poses,
   * so the plugin's retargeting is a no-op). These absolute rotations
   * cannot be applied directly to VRM bones.
   *
   * For each bone we compute:
   *   outputQ[i] = restQ * inv(srcQ[0]) * srcQ[i]
   *
   * - srcQ[0]: the source skeleton's standing pose for this bone (frame 0).
   * - inv(srcQ[0]) * srcQ[i]: motion delta from the standing pose.
   * - restQ: the VRM bone's desired rest quaternion. For most bones this
   *   is identity (T-pose). For arm bones it uses REST_POSE_EULER values
   *   matching RestPoseLayer, so frame 0 = natural standing pose.
   */
  private buildClip(vrmAnim: VrmAnimationData): unknown {
    if (!this.humanoid || !this.threeMod) return null;

    const THREE = this.threeMod as {
      QuaternionKeyframeTrack: new (n: string, t: Float32Array, v: Float32Array) => unknown;
      VectorKeyframeTrack: new (n: string, t: Float32Array, v: Float32Array) => unknown;
      AnimationClip: new (n: string, d: number, t: unknown[]) => unknown;
    };

    const tracks: unknown[] = [];

    // --- Rotation tracks ---
    for (const [boneName, srcTrack] of vrmAnim.humanoidTracks.rotation.entries()) {
      const node = this.humanoid.getNormalizedBoneNode(boneName);
      if (!node) continue;

      const frameCount = srcTrack.values.length / 4;
      if (frameCount < 1) continue;

      const euler = REST_POSE_EULER[boneName];
      const restQ: Q = euler
        ? qFromEulerXYZ(euler.x, euler.y, euler.z)
        : {
            x: node.quaternion.x,
            y: node.quaternion.y,
            z: node.quaternion.z,
            w: node.quaternion.w,
          };

      const src0 = qRead(srcTrack.values, 0);
      const src0Inv = qInv(src0);

      const out = new Float32Array(srcTrack.values.length);
      for (let i = 0; i < frameCount; i++) {
        const srcQ = qRead(srcTrack.values, i);
        const delta = qMul(src0Inv, srcQ);
        qWrite(out, i, qMul(restQ, delta));
      }

      tracks.push(
        new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, srcTrack.times, out)
      );
    }

    // --- Hips translation ---
    const hipsSrc = vrmAnim.humanoidTracks.translation.get("hips");
    const hipsNode = this.humanoid.getNormalizedBoneNode("hips");
    if (hipsSrc && hipsNode) {
      const frameCount = hipsSrc.values.length / 3;
      const rest = hipsNode.position;
      const bx = hipsSrc.values[0] ?? 0;
      const by = hipsSrc.values[1] ?? 0;
      const bz = hipsSrc.values[2] ?? 0;

      const vrmHipsY = this.humanoid.normalizedRestPose.hips.position[1];
      const srcHipsY = vrmAnim.restHipsPosition.y;
      const scale = srcHipsY > 0.001 ? vrmHipsY / srcHipsY : 1;

      const out = new Float32Array(hipsSrc.values.length);
      for (let i = 0; i < frameCount; i++) {
        const o = i * 3;
        out[o] = rest.x + ((hipsSrc.values[o] ?? 0) - bx) * scale;
        out[o + 1] = rest.y + ((hipsSrc.values[o + 1] ?? 0) - by) * scale;
        out[o + 2] = rest.z + ((hipsSrc.values[o + 2] ?? 0) - bz) * scale;
      }

      tracks.push(new THREE.VectorKeyframeTrack(`${hipsNode.name}.position`, hipsSrc.times, out));
    }

    return new THREE.AnimationClip("Clip", vrmAnim.duration, tracks);
  }

  private async loadClipOnDemand(clipId: string): Promise<void> {
    if (this.clips.has(clipId) || this.loadingClips.has(clipId)) return;
    if (!this.loaderInstance || !this.humanoid) return;

    const def = this.manifest.find((c) => c.id === clipId);
    if (!def) return;

    this.loadingClips.add(clipId);
    try {
      const gltf = await this.loaderInstance.loadAsync(`/motions/${def.file}`);
      const animations = gltf.userData.vrmAnimations as unknown[] | undefined;
      if (animations?.[0]) {
        const clip = this.buildClip(animations[0] as VrmAnimationData);
        if (clip) {
          this.clips.set(clipId, clip);
        }
      }
    } catch (err) {
      console.warn(`[MotionClipLayer] Failed to load clip ${clipId}:`, err);
    } finally {
      this.loadingClips.delete(clipId);
    }
  }

  play(clipId: string): void {
    const clip = this.clips.get(clipId);
    if (!clip || !this.mixer) return;

    // Stop previous action and start new one atomically.
    // Immediately evaluate (mixer.update(0)) so the new clip's frame 0
    // is applied before the next render — no 1-frame T-pose flash.
    if (this.currentAction) {
      this.currentAction.stop();
    }

    const action = this.mixer.clipAction(clip);
    const def = this.manifest.find((c) => c.id === clipId);
    if (def && !def.loop) {
      action.setLoop(2200, 1); // THREE.LoopOnce = 2200
      action.clampWhenFinished = true;
    }
    action.reset().play();
    this.currentAction = action;
    this.isPlaying = true;
  }

  private pickNextIdleClip(): string | null {
    if (this.idleClipIds.length === 0) return null;
    let idx: number;
    if (this.idleClipIds.length === 1) {
      idx = 0;
    } else {
      do {
        idx = Math.floor(Math.random() * this.idleClipIds.length);
      } while (idx === this.lastIdleIndex);
    }
    this.lastIdleIndex = idx;
    return this.idleClipIds[idx] as string;
  }

  update(delta: number, context: AnimationContext): LayerOutput {
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

    // Seek mode: use mixer.setTime to jump to absolute time
    if (context.seekTime != null && this.currentAction && this.mixer) {
      this.currentAction.reset().play();
      this.mixer.setTime(context.seekTime);
      this.isSeeking = true;
    } else {
      this.isSeeking = false;
      this.mixer?.update(delta);
    }

    // Detect clip finished (skip during seek)
    const clipFinished = !this.isSeeking && this.currentAction && !this.currentAction.isRunning();

    // Idle auto-play: only when no explicit action is set.
    // When an idle clip finishes, immediately play the next one (no gap).
    if (
      !this.pendingAction &&
      this.idlePreloaded &&
      context.avatarState === "idle" &&
      context.seekTime == null
    ) {
      if (clipFinished && this.isIdleClip) {
        this.idleCooldown = IDLE_MIN_PAUSE + Math.random() * IDLE_RANDOM_PAUSE;
      }

      this.idleCooldown -= delta;
      if (this.idleCooldown <= 0 && (!this.isPlaying || (clipFinished && this.isIdleClip))) {
        const nextIdle = this.pickNextIdleClip();
        if (nextIdle && this.clips.has(nextIdle)) {
          this.play(nextIdle);
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
