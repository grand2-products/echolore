import { fbm1D } from "./noise";
import type { AnimationContext, AnimationLayer, LayerOutput } from "./types";

export class IdleMotionLayer implements AnimationLayer {
  update(_delta: number, context: AnimationContext): LayerOutput {
    const t = context.elapsedTime;
    const isTalking = context.avatarState === "talking";
    const isThinking = context.avatarState === "thinking";

    const headMultiplier = isTalking ? 1.5 : 1;

    const spineZ = fbm1D(t * 0.3) * 0.015;
    const headY = fbm1D(t * 0.5 + 100) * 0.02 * headMultiplier;
    let headX = fbm1D(t * 0.4 + 200) * 0.01 * headMultiplier;

    if (isThinking) {
      headX += 0.03;
    }

    return {
      boneRotations: {
        spine: { x: 0, y: 0, z: spineZ },
        head: { x: headX, y: headY, z: 0 },
      },
    };
  }

  reset(): void {
    // Stateless
  }
}
