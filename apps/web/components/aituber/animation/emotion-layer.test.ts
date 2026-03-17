import { describe, expect, it } from "vitest";
import { EmotionLayer } from "./emotion-layer";
import type { AnimationContext, EmotionState } from "./types";

const makeContext = (overrides: Partial<AnimationContext> = {}): AnimationContext => ({
  avatarState: "idle",
  audioAnalyser: null,
  audioSampleRate: 48000,
  emotion: null,
  elapsedTime: 0,
  visemes: null,
  action: null,
  ...overrides,
});

describe("EmotionLayer", () => {
  it("outputs happy expression when emotion is happy", () => {
    const layer = new EmotionLayer();
    const emotion: EmotionState = { type: "happy", intensity: 0.8 };

    // Run a few frames to let internal lerp ramp up
    let output = { expressions: {} as Record<string, number> };
    for (let i = 0; i < 30; i++) {
      output = layer.update(0.016, makeContext({ emotion })) as typeof output;
    }

    expect(output.expressions?.happy).toBeGreaterThan(0.3);
  });

  it("returns empty output for neutral emotion", () => {
    const layer = new EmotionLayer();
    const output = layer.update(0.016, makeContext({ emotion: { type: "neutral", intensity: 0 } }));
    expect(output.expressions).toBeUndefined();
  });

  it("fades out after hold duration", () => {
    const layer = new EmotionLayer();
    const emotion: EmotionState = { type: "happy", intensity: 0.8 };
    const ctx = makeContext({ emotion });

    // Ramp up
    for (let i = 0; i < 30; i++) {
      layer.update(0.016, ctx);
    }

    // Simulate 5+ seconds (hold duration) - ~350 frames at 16ms
    for (let i = 0; i < 350; i++) {
      layer.update(0.016, ctx);
    }

    // After hold period, should be fading out
    const output = layer.update(0.016, ctx);
    const happyVal = output.expressions?.happy ?? 0;
    expect(happyVal).toBeLessThan(0.1);
  });

  it("resets to zero on new neutral emotion after active emotion", () => {
    const layer = new EmotionLayer();

    // Set happy emotion
    const happyEmotion: EmotionState = { type: "happy", intensity: 0.8 };
    for (let i = 0; i < 30; i++) {
      layer.update(0.016, makeContext({ emotion: happyEmotion }));
    }

    // Set null emotion and let it fade
    // Need enough frames: 5s hold (312 frames) + fade time (~60 frames)
    for (let i = 0; i < 500; i++) {
      layer.update(0.016, makeContext({ emotion: null }));
    }

    const output = layer.update(0.016, makeContext({ emotion: null }));
    const happyVal = output.expressions?.happy ?? 0;
    expect(happyVal).toBeLessThan(0.05);
  });

  it("does not output blink-related expressions", () => {
    const layer = new EmotionLayer();
    const emotion: EmotionState = { type: "happy", intensity: 1.0 };

    for (let i = 0; i < 30; i++) {
      layer.update(0.016, makeContext({ emotion }));
    }
    const output = layer.update(0.016, makeContext({ emotion }));

    expect(output.expressions?.blink).toBeUndefined();
    expect(output.expressions?.blinkLeft).toBeUndefined();
    expect(output.expressions?.blinkRight).toBeUndefined();
  });
});
