import { fbm1D } from "./noise";
import type { AnimationContext, AnimationLayer, LayerOutput } from "./types";

export class IdleMotionLayer implements AnimationLayer {
  update(_delta: number, context: AnimationContext): LayerOutput {
    const t = context.elapsedTime;
    const headMultiplier = context.avatarState === "talking" ? 1.5 : 1;

    const headX = fbm1D(t * 0.4 + 200) * 0.01 * headMultiplier;
    const headY = fbm1D(t * 0.5 + 100) * 0.02 * headMultiplier;
    const spineZ = fbm1D(t * 0.3) * 0.015;

    const boneRotations: Record<string, { x: number; y: number; z: number }> = {
      head: {
        x: headX + (context.avatarState === "thinking" ? 0.03 : 0),
        y: headY,
        z: 0,
      },
      spine: { x: 0, y: 0, z: spineZ },
    };

    return { boneRotations };
  }

  reset(): void {
    // stateless
  }
}
