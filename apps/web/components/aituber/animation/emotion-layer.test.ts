import { describe, expect, it } from "vitest";
import { EmotionLayer } from "./emotion-layer";
import type { AnimationContext } from "./types";

function makeContext(overrides?: Partial<AnimationContext>): AnimationContext {
  return {
    avatarState: "idle",
    audioAnalyser: null,
    audioSampleRate: 48000,
    emotion: null,
    elapsedTime: 0,
    visemes: null,
    ...overrides,
  };
}

describe("EmotionLayer", () => {
  it("outputs expressions when emotion is set", () => {
    const layer = new EmotionLayer();
    const emotion = { type: "happy" as const, intensity: 0.8 };
    const ctx = makeContext({ emotion });

    // Run a few frames
    let out = { expressions: {} as Record<string, number> };
    for (let i = 0; i < 10; i++) {
      out = layer.update(0.016, ctx) as typeof out;
    }

    expect(out.expressions?.happy).toBeGreaterThan(0);
  });

  it("fades out after HOLD_DURATION seconds", () => {
    const layer = new EmotionLayer();
    const emotion = { type: "happy" as const, intensity: 0.8 };
    const ctx = makeContext({ emotion });

    // Ramp up
    for (let i = 0; i < 30; i++) layer.update(0.016, ctx);

    const peakOut = layer.update(0.016, ctx) as { expressions?: Record<string, number> };
    const peakVal = peakOut.expressions?.happy ?? 0;
    expect(peakVal).toBeGreaterThan(0.1);

    // Advance past hold duration (5s) + extra for fadeout
    // ~350 frames at 16ms = 5.6s
    for (let i = 0; i < 350; i++) layer.update(0.016, ctx);

    // Additional fadeout time
    for (let i = 0; i < 200; i++) layer.update(0.016, ctx);

    const fadeOut = layer.update(0.016, ctx) as { expressions?: Record<string, number> };
    const fadeVal = fadeOut.expressions?.happy ?? 0;
    expect(fadeVal).toBeLessThan(0.05);
  });

  it("resets hold timer on new emotion", () => {
    const layer = new EmotionLayer();
    const emotion1 = { type: "happy" as const, intensity: 0.8 };
    const ctx1 = makeContext({ emotion: emotion1 });

    // Run for 4 seconds (almost at hold expiry)
    for (let i = 0; i < 250; i++) layer.update(0.016, ctx1);

    // New emotion resets the timer
    const emotion2 = { type: "sad" as const, intensity: 0.6 };
    const ctx2 = makeContext({ emotion: emotion2 });

    for (let i = 0; i < 60; i++) layer.update(0.016, ctx2);

    const out = layer.update(0.016, ctx2) as { expressions?: Record<string, number> };
    const sadVal = out.expressions?.sad ?? 0;
    expect(sadVal).toBeGreaterThan(0.1);
  });

  it("does not interfere with blink expressions", () => {
    const layer = new EmotionLayer();
    const emotion = { type: "happy" as const, intensity: 1.0 };
    const ctx = makeContext({ emotion });

    for (let i = 0; i < 30; i++) layer.update(0.016, ctx);

    const out = layer.update(0.016, ctx) as { expressions?: Record<string, number> };
    // EmotionLayer should not output blink-related expressions
    expect(out.expressions?.blink).toBeUndefined();
    expect(out.expressions?.blinkLeft).toBeUndefined();
    expect(out.expressions?.blinkRight).toBeUndefined();
  });

  it("returns empty output for neutral emotion", () => {
    const layer = new EmotionLayer();
    const emotion = { type: "neutral" as const, intensity: 0.5 };
    const ctx = makeContext({ emotion });

    const out = layer.update(0.016, ctx);
    expect(out.expressions).toBeUndefined();
  });
});
