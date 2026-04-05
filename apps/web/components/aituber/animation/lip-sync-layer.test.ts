import { describe, expect, it, vi } from "vitest";
import { LipSyncLayer } from "./lip-sync-layer";
import type { AnimationContext, VisemeEntry } from "./types";

function makeContext(overrides?: Partial<AnimationContext>): AnimationContext {
  return {
    avatarState: "idle",
    emotion: null,
    elapsedTime: 0,
    visemes: null,
    ...overrides,
  };
}

describe("LipSyncLayer", () => {
  describe("viseme timestamp mode", () => {
    it("selects correct viseme based on elapsed time", () => {
      const layer = new LipSyncLayer();

      // Mock performance.now to control timing
      const start = performance.now();
      vi.spyOn(performance, "now").mockReturnValue(start);

      const visemes: VisemeEntry[] = [
        { time: 0, viseme: "viseme_aa" },
        { time: 0.3, viseme: "viseme_O" },
        { time: 0.6, viseme: "viseme_sil" },
      ];

      const ctx = makeContext({ avatarState: "talking", visemes });

      // First frame - should start viseme playback
      layer.update(0.016, ctx);

      // Advance to 0.15s - should be viseme_aa
      vi.spyOn(performance, "now").mockReturnValue(start + 150);
      const out1 = layer.update(0.016, ctx) as { expressions?: Record<string, number> };
      // viseme_aa maps to aa: 1.0
      expect(out1.expressions?.aa).toBeGreaterThan(0);

      // Advance to 0.4s - should be viseme_O
      vi.spyOn(performance, "now").mockReturnValue(start + 400);
      const out2 = layer.update(0.016, ctx) as { expressions?: Record<string, number> };
      // viseme_O maps to oh: 0.9
      expect(out2.expressions?.oh).toBeGreaterThan(0);

      vi.restoreAllMocks();
    });

    it("maps viseme_aa to aa expression", () => {
      const layer = new LipSyncLayer();
      const start = performance.now();
      vi.spyOn(performance, "now").mockReturnValue(start);

      const visemes: VisemeEntry[] = [{ time: 0, viseme: "viseme_aa" }];
      const ctx = makeContext({ avatarState: "talking", visemes });

      // Run several frames to let smoothing converge
      for (let i = 0; i < 20; i++) {
        vi.spyOn(performance, "now").mockReturnValue(start + i * 16);
        layer.update(0.016, ctx);
      }

      vi.spyOn(performance, "now").mockReturnValue(start + 320);
      const out = layer.update(0.016, ctx) as { expressions?: Record<string, number> };
      expect(out.expressions?.aa).toBeGreaterThan(0.5);

      vi.restoreAllMocks();
    });
  });

  describe("audio fallback mode", () => {
    it("returns zero expressions when not talking", () => {
      const layer = new LipSyncLayer();
      const ctx = makeContext({ avatarState: "idle" });

      const out = layer.update(0.016, ctx);
      // Should have no significant values
      const values = Object.values(out.expressions ?? {});
      const sum = values.reduce((a: number, b) => a + (b ?? 0), 0);
      expect(sum).toBeLessThan(0.1);
    });

    it("decays gracefully when talking without visemes", () => {
      const layer = new LipSyncLayer();

      const ctx = makeContext({
        avatarState: "talking",
        visemes: null,
      });
      // Should not throw and should return valid output
      const out = layer.update(0.016, ctx);
      expect(out).toBeDefined();
    });
  });

  describe("reset", () => {
    it("clears internal state", () => {
      const layer = new LipSyncLayer();
      const start = performance.now();
      vi.spyOn(performance, "now").mockReturnValue(start);

      const visemes: VisemeEntry[] = [{ time: 0, viseme: "viseme_aa" }];
      const ctx = makeContext({ avatarState: "talking", visemes });

      for (let i = 0; i < 10; i++) {
        vi.spyOn(performance, "now").mockReturnValue(start + i * 16);
        layer.update(0.016, ctx);
      }

      layer.reset();

      // After reset, should start fresh
      const ctx2 = makeContext({ avatarState: "idle" });
      const out = layer.update(0.016, ctx2);
      const values = Object.values(out.expressions ?? {});
      const sum = values.reduce((a: number, b) => a + (b ?? 0), 0);
      expect(sum).toBeLessThan(0.1);

      vi.restoreAllMocks();
    });
  });
});
