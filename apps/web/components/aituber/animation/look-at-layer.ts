import { fbm1D } from "./noise";
import type { AnimationContext, AnimationLayer, LayerOutput } from "./types";

/**
 * LookAtLayer uses VRMLookAt for gaze tracking.
 * Target drifts near camera position with fbm noise.
 */
export class LookAtLayer implements AnimationLayer {
  private targetObject: { position: { set: (x: number, y: number, z: number) => void } } | null =
    null;

  setup(vrm: Record<string, unknown>, THREE: Record<string, unknown>, scene: unknown): void {
    const vrmLookAt = (vrm as { lookAt?: { autoUpdate: boolean; target: unknown } }).lookAt;
    if (!vrmLookAt) return;

    const Object3DCtor = (
      THREE as {
        Object3D: new () => { position: { set: (x: number, y: number, z: number) => void } };
      }
    ).Object3D;
    const target = new Object3DCtor();
    target.position.set(0, 1.3, 1.5);
    (scene as { add: (obj: unknown) => void }).add(target);

    vrmLookAt.autoUpdate = true;
    vrmLookAt.target = target;
    this.targetObject = target;
  }

  update(_delta: number, context: AnimationContext): LayerOutput {
    if (!this.targetObject) return {};

    const t = context.elapsedTime;
    const isTalking = context.avatarState === "talking";
    const isThinking = context.avatarState === "thinking";

    const driftScale = isTalking ? 1.3 : 1;

    let x = fbm1D(t * 0.3 + 500) * 0.15 * driftScale;
    let y = 1.3 + fbm1D(t * 0.25 + 600) * 0.08 * driftScale;
    const z = 1.5;

    // Thinking: look upper-right
    if (isThinking) {
      x += 0.3;
      y += 0.15;
    }

    this.targetObject.position.set(x, y, z);
    return {};
  }

  reset(): void {
    this.targetObject = null;
  }
}
