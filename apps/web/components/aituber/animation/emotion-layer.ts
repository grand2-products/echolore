import type {
  AnimationContext,
  AnimationLayer,
  EmotionState,
  EmotionType,
  LayerOutput,
} from "./types";

const EMOTION_MAP: Record<EmotionType, Record<string, number>> = {
  neutral: {},
  happy: { happy: 0.6, relaxed: 0.2 },
  sad: { sad: 0.7 },
  angry: { angry: 0.6 },
  surprised: { surprised: 0.8 },
  relaxed: { relaxed: 0.5 },
};

const HOLD_DURATION = 5;
const FADE_SPEED = 3;

export class EmotionLayer implements AnimationLayer {
  private currentType: EmotionType = "neutral";
  private currentIntensity = 0;
  private targetIntensity = 0;
  private holdTimer = 0;
  private lastEmotionRef: EmotionState | null = null;

  update(delta: number, context: AnimationContext): LayerOutput {
    const emotion = context.emotion;

    // Detect new emotion
    if (emotion && emotion !== this.lastEmotionRef && emotion.type !== "neutral") {
      this.currentType = emotion.type;
      this.targetIntensity = emotion.intensity;
      this.holdTimer = HOLD_DURATION;
      this.lastEmotionRef = emotion;
    }

    // Count down hold timer
    if (this.holdTimer > 0) {
      this.holdTimer -= delta;
      if (this.holdTimer <= 0) {
        this.targetIntensity = 0;
      }
    }

    // Internal lerp for smooth fade
    this.currentIntensity +=
      (this.targetIntensity - this.currentIntensity) * (1 - Math.exp(-FADE_SPEED * delta));

    if (this.currentIntensity < 0.01) {
      this.currentIntensity = 0;
      return {};
    }

    const mapping = EMOTION_MAP[this.currentType];
    if (!mapping) return {};

    const expressions: Record<string, number> = {};
    for (const [name, weight] of Object.entries(mapping)) {
      expressions[name] = weight * this.currentIntensity;
    }

    return { expressions };
  }

  reset(): void {
    this.currentType = "neutral";
    this.currentIntensity = 0;
    this.targetIntensity = 0;
    this.holdTimer = 0;
    this.lastEmotionRef = null;
  }
}
