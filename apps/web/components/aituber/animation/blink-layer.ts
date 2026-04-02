import type { AnimationContext, AnimationLayer, EmotionType, LayerOutput } from "./types";

type BlinkState = "idle" | "closing" | "holding" | "opening";

const BASE_CLOSE_DURATION = 0.06;
const BASE_HOLD_DURATION = 0.04;
const BASE_OPEN_DURATION = 0.08;
const DOUBLE_BLINK_CHANCE = 0.2;
const DOUBLE_BLINK_GAP = 0.1;

interface BlinkEmotionParams {
  intervalMin: number;
  intervalMax: number;
  closeMul: number;
  holdMul: number;
  openMul: number;
}

const EMOTION_BLINK: Record<EmotionType, BlinkEmotionParams> = {
  neutral: { intervalMin: 3, intervalMax: 7, closeMul: 1.0, holdMul: 1.0, openMul: 1.0 },
  happy: { intervalMin: 2.5, intervalMax: 5, closeMul: 1.0, holdMul: 1.0, openMul: 1.0 },
  sad: { intervalMin: 2, intervalMax: 4, closeMul: 1.3, holdMul: 1.5, openMul: 1.4 },
  angry: { intervalMin: 5, intervalMax: 10, closeMul: 0.8, holdMul: 0.8, openMul: 0.8 },
  surprised: { intervalMin: 6, intervalMax: 12, closeMul: 1.0, holdMul: 1.0, openMul: 1.0 },
  relaxed: { intervalMin: 3, intervalMax: 6, closeMul: 1.1, holdMul: 1.2, openMul: 1.1 },
};

function randomInterval(talking: boolean, emotion: EmotionType): number {
  const params = EMOTION_BLINK[emotion];
  const min = talking ? params.intervalMin * 0.7 : params.intervalMin;
  const max = talking ? params.intervalMax * 0.7 : params.intervalMax;
  return min + Math.random() * (max - min);
}

export class BlinkLayer implements AnimationLayer {
  private state: BlinkState = "idle";
  private timer = 0;
  private nextBlink = randomInterval(false, "neutral");
  private blinkValue = 0;
  private pendingDouble = false;
  private currentEmotion: EmotionType = "neutral";

  update(delta: number, context: AnimationContext): LayerOutput {
    this.timer += delta;
    const talking = context.avatarState === "talking";
    this.currentEmotion = context.emotion?.type ?? "neutral";
    const params = EMOTION_BLINK[this.currentEmotion];

    const closeDur = BASE_CLOSE_DURATION * params.closeMul;
    const holdDur = BASE_HOLD_DURATION * params.holdMul;
    const openDur = BASE_OPEN_DURATION * params.openMul;

    switch (this.state) {
      case "idle":
        if (this.timer >= this.nextBlink) {
          this.state = "closing";
          this.timer = 0;
          this.pendingDouble = Math.random() < DOUBLE_BLINK_CHANCE;
        }
        break;
      case "closing":
        this.blinkValue = Math.min(this.timer / closeDur, 1);
        if (this.timer >= closeDur) {
          this.state = "holding";
          this.timer = 0;
        }
        break;
      case "holding":
        this.blinkValue = 1;
        if (this.timer >= holdDur) {
          this.state = "opening";
          this.timer = 0;
        }
        break;
      case "opening":
        this.blinkValue = Math.max(1 - this.timer / openDur, 0);
        if (this.timer >= openDur) {
          if (this.pendingDouble) {
            this.pendingDouble = false;
            this.state = "idle";
            this.timer = 0;
            this.blinkValue = 0;
            this.nextBlink = DOUBLE_BLINK_GAP;
          } else {
            this.state = "idle";
            this.timer = 0;
            this.nextBlink = randomInterval(talking, this.currentEmotion);
            this.blinkValue = 0;
          }
        }
        break;
    }

    return {
      expressions: {
        blink: this.blinkValue,
        blinkLeft: this.blinkValue,
        blinkRight: this.blinkValue,
      },
    };
  }

  reset(): void {
    this.state = "idle";
    this.timer = 0;
    this.blinkValue = 0;
    this.nextBlink = randomInterval(false, "neutral");
    this.pendingDouble = false;
    this.currentEmotion = "neutral";
  }
}
