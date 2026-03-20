import type { AnimationContext, AnimationLayer, LayerOutput } from "./types";

export class BreathingLayer implements AnimationLayer {
  private phase = 0;

  update(delta: number, context: AnimationContext): LayerOutput {
    const talking = context.avatarState === "talking";
    const rate = talking ? 0.35 : 0.25;
    this.phase = (this.phase + delta * rate * Math.PI * 2) % (Math.PI * 2);

    const amp = talking ? 0.045 : 0.035;
    const s = Math.sin(this.phase);

    return {
      boneRotations: {
        chest: { x: s * amp, y: 0, z: 0 },
        upperChest: { x: s * amp * 0.5, y: 0, z: s * amp * 0.2 },
        spine: { x: s * amp * 0.3, y: 0, z: 0 },
      },
    };
  }

  reset(): void {
    this.phase = 0;
  }
}
