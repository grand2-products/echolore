import type { AnimationContext, AnimationLayer, LayerOutput } from "./types";

export class BreathingLayer implements AnimationLayer {
  update(_delta: number, context: AnimationContext): LayerOutput {
    const isTalking = context.avatarState === "talking";
    const rate = isTalking ? 0.35 : 0.25;
    const amp = isTalking ? 0.045 : 0.035;
    const t = context.elapsedTime;
    const phase = Math.sin(t * Math.PI * 2 * rate);

    return {
      boneRotations: {
        chest: { x: phase * amp, y: 0, z: 0 },
        upperChest: { x: phase * amp * 0.5, y: 0, z: phase * amp * 0.2 },
        spine: { x: phase * amp * 0.3, y: 0, z: 0 },
      },
    };
  }

  reset(): void {
    // Stateless
  }
}
