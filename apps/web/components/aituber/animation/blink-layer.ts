import type { AnimationContext, AnimationLayer, LayerOutput } from "./types";

type BlinkState = "idle" | "closing" | "holding" | "opening";

const CLOSE_DURATION = 0.06;
const HOLD_DURATION = 0.04;
const OPEN_DURATION = 0.08;
const DOUBLE_BLINK_CHANCE = 0.2;
const DOUBLE_BLINK_GAP = 0.1;

function randomInterval(talking: boolean): number {
  return talking ? 2.5 + Math.random() * 2.5 : 3 + Math.random() * 4;
}

export class BlinkLayer implements AnimationLayer {
  private state: BlinkState = "idle";
  private timer = 0;
  private nextBlink = randomInterval(false);
  private blinkValue = 0;
  private pendingDouble = false;

  update(delta: number, context: AnimationContext): LayerOutput {
    this.timer += delta;
    const talking = context.avatarState === "talking";

    switch (this.state) {
      case "idle":
        if (this.timer >= this.nextBlink) {
          this.state = "closing";
          this.timer = 0;
          this.pendingDouble = Math.random() < DOUBLE_BLINK_CHANCE;
        }
        break;
      case "closing":
        this.blinkValue = Math.min(this.timer / CLOSE_DURATION, 1);
        if (this.timer >= CLOSE_DURATION) {
          this.state = "holding";
          this.timer = 0;
        }
        break;
      case "holding":
        this.blinkValue = 1;
        if (this.timer >= HOLD_DURATION) {
          this.state = "opening";
          this.timer = 0;
        }
        break;
      case "opening":
        this.blinkValue = Math.max(1 - this.timer / OPEN_DURATION, 0);
        if (this.timer >= OPEN_DURATION) {
          if (this.pendingDouble) {
            this.pendingDouble = false;
            this.state = "idle";
            this.timer = 0;
            this.blinkValue = 0;
            this.nextBlink = DOUBLE_BLINK_GAP;
          } else {
            this.state = "idle";
            this.timer = 0;
            this.nextBlink = randomInterval(talking);
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
    this.nextBlink = randomInterval(false);
    this.pendingDouble = false;
  }
}
