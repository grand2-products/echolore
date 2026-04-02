import type { AnimationContext, AnimationLayer, EmotionType, LayerOutput } from "./types";

const EMOTION_MODIFIERS: Record<EmotionType, { rateMul: number; ampMul: number }> = {
  neutral: { rateMul: 1.0, ampMul: 1.0 },
  happy: { rateMul: 1.1, ampMul: 1.2 },
  angry: { rateMul: 1.3, ampMul: 1.4 },
  sad: { rateMul: 0.8, ampMul: 0.9 },
  surprised: { rateMul: 1.0, ampMul: 1.5 },
  relaxed: { rateMul: 0.85, ampMul: 1.1 },
};

export class BreathingLayer implements AnimationLayer {
  private phase = 0;
  private currentRateMul = 1.0;
  private currentAmpMul = 1.0;

  update(delta: number, context: AnimationContext): LayerOutput {
    const talking = context.avatarState === "talking";
    const baseRate = talking ? 0.35 : 0.25;
    const baseAmp = talking ? 0.045 : 0.035;

    // Smoothly interpolate toward emotion-driven modifiers
    const emotionType = context.emotion?.type ?? "neutral";
    const mod = EMOTION_MODIFIERS[emotionType];
    const lerpFactor = 1 - Math.exp(-2 * delta);
    this.currentRateMul += (mod.rateMul - this.currentRateMul) * lerpFactor;
    this.currentAmpMul += (mod.ampMul - this.currentAmpMul) * lerpFactor;

    const rate = baseRate * this.currentRateMul;
    const amp = baseAmp * this.currentAmpMul;

    this.phase = (this.phase + delta * rate * Math.PI * 2) % (Math.PI * 2);
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
    this.currentRateMul = 1.0;
    this.currentAmpMul = 1.0;
  }
}
