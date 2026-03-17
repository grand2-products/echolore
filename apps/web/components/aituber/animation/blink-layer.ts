import type { AnimationContext, AnimationLayer, LayerOutput } from "./types";

type BlinkPhase = "idle" | "closing" | "holding" | "opening";

const CLOSE_DURATION = 0.06;
const HOLD_DURATION = 0.04;
const OPEN_DURATION = 0.08;

export class BlinkLayer implements AnimationLayer {
  private phase: BlinkPhase = "idle";
  private phaseTime = 0;
  private nextBlinkIn: number;
  private doubleBlink = false;
  private doubleBlinkDone = false;

  constructor() {
    this.nextBlinkIn = this.randomInterval(false);
  }

  update(delta: number, context: AnimationContext): LayerOutput {
    const isTalking = context.avatarState === "talking";
    this.phaseTime += delta;

    if (this.phase === "idle") {
      this.nextBlinkIn -= delta;
      if (this.nextBlinkIn <= 0) {
        this.phase = "closing";
        this.phaseTime = 0;
        this.doubleBlink = Math.random() < 0.2;
        this.doubleBlinkDone = false;
      }
      return { expressions: { blink: 0, blinkLeft: 0, blinkRight: 0 } };
    }

    let value = 0;

    if (this.phase === "closing") {
      value = Math.min(this.phaseTime / CLOSE_DURATION, 1);
      if (this.phaseTime >= CLOSE_DURATION) {
        this.phase = "holding";
        this.phaseTime = 0;
      }
    } else if (this.phase === "holding") {
      value = 1;
      if (this.phaseTime >= HOLD_DURATION) {
        this.phase = "opening";
        this.phaseTime = 0;
      }
    } else if (this.phase === "opening") {
      value = 1 - Math.min(this.phaseTime / OPEN_DURATION, 1);
      if (this.phaseTime >= OPEN_DURATION) {
        if (this.doubleBlink && !this.doubleBlinkDone) {
          this.doubleBlinkDone = true;
          this.phase = "closing";
          this.phaseTime = -0.1; // 100ms gap
        } else {
          this.phase = "idle";
          this.phaseTime = 0;
          this.nextBlinkIn = this.randomInterval(isTalking);
        }
      }
    }

    return {
      expressions: { blink: value, blinkLeft: value, blinkRight: value },
    };
  }

  reset(): void {
    this.phase = "idle";
    this.phaseTime = 0;
    this.nextBlinkIn = this.randomInterval(false);
  }

  private randomInterval(talking: boolean): number {
    const min = talking ? 2.5 : 3;
    const max = talking ? 5 : 7;
    return min + Math.random() * (max - min);
  }
}
