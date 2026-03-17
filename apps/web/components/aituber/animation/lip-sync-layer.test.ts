import { describe, expect, it } from "vitest";
import { LipSyncLayer } from "./lip-sync-layer";
import type { AnimationContext, VisemeEntry } from "./types";

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

describe("LipSyncLayer", () => {
  describe("viseme timestamp mode", () => {
    it("selects correct viseme based on elapsed time", () => {
      const layer = new LipSyncLayer();
      const visemes: VisemeEntry[] = [
        { time: 0, viseme: "viseme_aa" },
        { time: 0.2, viseme: "viseme_I" },
        { time: 0.4, viseme: "viseme_O" },
      ];

      const output = layer.update(
        0.016,
        makeContext({
          avatarState: "talking",
          visemes,
          elapsedTime: 0.1,
        })
      );

      // At elapsed 0.1, first viseme (viseme_aa) should be active
      expect(output.expressions?.aa).toBeGreaterThan(0);
    });

    it("maps viseme_aa to aa expression", () => {
      const layer = new LipSyncLayer();
      const visemes: VisemeEntry[] = [{ time: 0, viseme: "viseme_aa" }];

      // Run a few frames to let smoothing ramp up
      let output = { expressions: {} as Record<string, number> };
      for (let i = 0; i < 10; i++) {
        output = layer.update(
          0.016,
          makeContext({
            avatarState: "talking",
            visemes,
            elapsedTime: i * 0.016,
          })
        ) as typeof output;
      }

      expect(output.expressions?.aa).toBeGreaterThan(0);
    });

    it("maps viseme_U to ou expression", () => {
      const layer = new LipSyncLayer();
      const visemes: VisemeEntry[] = [{ time: 0, viseme: "viseme_U" }];

      let output = { expressions: {} as Record<string, number> };
      for (let i = 0; i < 10; i++) {
        output = layer.update(
          0.016,
          makeContext({
            avatarState: "talking",
            visemes,
            elapsedTime: i * 0.016,
          })
        ) as typeof output;
      }

      expect(output.expressions?.ou).toBeGreaterThan(0);
    });
  });

  describe("audio fallback mode", () => {
    it("returns zero expressions when not talking", () => {
      const layer = new LipSyncLayer();
      const output = layer.update(0.016, makeContext({ avatarState: "idle" }));

      expect(output.expressions?.aa).toBe(0);
      expect(output.expressions?.ih).toBe(0);
    });

    it("decays values toward zero when not talking", () => {
      const layer = new LipSyncLayer();

      // First set some visemes to create non-zero state
      const visemes: VisemeEntry[] = [{ time: 0, viseme: "viseme_aa" }];
      for (let i = 0; i < 10; i++) {
        layer.update(
          0.016,
          makeContext({
            avatarState: "talking",
            visemes,
            elapsedTime: i * 0.016,
          })
        );
      }

      // Now stop talking and decay
      for (let i = 0; i < 30; i++) {
        layer.update(0.016, makeContext({ avatarState: "idle", elapsedTime: i * 0.016 }));
      }

      const output = layer.update(0.016, makeContext({ avatarState: "idle" }));
      expect(output.expressions?.aa).toBeLessThan(0.05);
    });
  });

  describe("reset", () => {
    it("resets all state", () => {
      const layer = new LipSyncLayer();
      const visemes: VisemeEntry[] = [{ time: 0, viseme: "viseme_aa" }];

      layer.update(
        0.016,
        makeContext({
          avatarState: "talking",
          visemes,
          elapsedTime: 0,
        })
      );

      layer.reset();

      const output = layer.update(0.016, makeContext({ avatarState: "idle" }));
      expect(output.expressions?.aa).toBe(0);
    });
  });
});
