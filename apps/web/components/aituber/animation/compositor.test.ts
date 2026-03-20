import { describe, expect, it } from "vitest";
import { AnimationCompositor } from "./compositor";
import type { AnimationContext, AnimationLayer, LayerOutput } from "./types";

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

function stubLayer(output: LayerOutput): AnimationLayer {
  return {
    update: () => output,
    reset: () => {},
  };
}

// Fake VRM for testing
function fakeVrm() {
  const expressions = new Map<string, number>();
  const bones = new Map<string, { x: number; y: number; z: number }>();

  return {
    expressionManager: {
      setValue: (name: string, value: number) => expressions.set(name, value),
    },
    humanoid: {
      getNormalizedBoneNode: (name: string) => {
        const q = { x: 0, y: 0, z: 0, w: 1, setFromEuler: () => {} };
        bones.set(name, { x: 0, y: 0, z: 0 });
        return { quaternion: q };
      },
    },
    _expressions: expressions,
    _bones: bones,
  };
}

// Fake THREE for setThree
const fakeThree = {
  Euler: class {
    x = 0;
    y = 0;
    z = 0;
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
  },
  Quaternion: class {
    setFromEuler() {
      return this;
    }
  },
};

describe("AnimationCompositor", () => {
  it("clamps expression values to [0, 1]", () => {
    const compositor = new AnimationCompositor();
    compositor.setThree(fakeThree as never);
    compositor.setLayers([stubLayer({ expressions: { happy: 1.5 } })]);

    const vrm = fakeVrm();
    const ctx = makeContext();

    // Run enough frames for LERP to converge
    for (let i = 0; i < 60; i++) compositor.update(0.016, ctx, vrm);

    const val = vrm._expressions.get("happy") ?? 0;
    expect(val).toBeGreaterThan(0);
    expect(val).toBeLessThanOrEqual(1);
  });

  it("merges face expressions with MAX strategy", () => {
    const compositor = new AnimationCompositor();
    compositor.setThree(fakeThree as never);
    compositor.setLayers([
      stubLayer({ expressions: { happy: 0.3 } }),
      stubLayer({ expressions: { happy: 0.6 } }),
    ]);

    const vrm = fakeVrm();
    const ctx = makeContext();

    for (let i = 0; i < 120; i++) compositor.update(0.016, ctx, vrm);

    const val = vrm._expressions.get("happy") ?? 0;
    // Should converge toward 0.6 (max), not 0.9 (sum)
    expect(val).toBeCloseTo(0.6, 1);
  });

  it("merges non-face expressions additively", () => {
    const compositor = new AnimationCompositor();
    compositor.setThree(fakeThree as never);
    compositor.setLayers([
      stubLayer({ expressions: { aa: 0.3 } }),
      stubLayer({ expressions: { aa: 0.4 } }),
    ]);

    const vrm = fakeVrm();
    const ctx = makeContext();

    for (let i = 0; i < 120; i++) compositor.update(0.016, ctx, vrm);

    const val = vrm._expressions.get("aa") ?? 0;
    // Should converge toward 0.7 (sum), clamped to 1
    expect(val).toBeCloseTo(0.7, 1);
  });

  it("merges bone rotations additively", () => {
    const compositor = new AnimationCompositor();
    compositor.setThree(fakeThree as never);
    compositor.setLayers([
      stubLayer({ boneRotations: { chest: { x: 0.02, y: 0, z: 0 } } }),
      stubLayer({ boneRotations: { chest: { x: 0.01, y: 0, z: 0.01 } } }),
    ]);

    const vrm = fakeVrm();
    const ctx = makeContext();

    // The compositor LERPs, so after many frames it converges
    for (let i = 0; i < 120; i++) compositor.update(0.016, ctx, vrm);

    // Bone should have been applied (getNormalizedBoneNode was called)
    expect(vrm._bones.has("chest")).toBe(true);
  });

  it("lerps toward target values over time", () => {
    const compositor = new AnimationCompositor();
    compositor.setThree(fakeThree as never);
    compositor.setLayers([stubLayer({ expressions: { happy: 0.8 } })]);

    const vrm = fakeVrm();
    const ctx = makeContext();

    // After 1 frame, should not be at target yet
    compositor.update(0.016, ctx, vrm);
    const after1 = vrm._expressions.get("happy") ?? 0;
    expect(after1).toBeGreaterThan(0);
    expect(after1).toBeLessThan(0.8);

    // After many frames, should be close to target
    for (let i = 0; i < 120; i++) compositor.update(0.016, ctx, vrm);
    const afterMany = vrm._expressions.get("happy") ?? 0;
    expect(afterMany).toBeCloseTo(0.8, 1);
  });

  it("resets all layers and internal state", () => {
    let resetCalled = false;
    const layer: AnimationLayer = {
      update: () => ({ expressions: { happy: 0.5 } }),
      reset: () => {
        resetCalled = true;
      },
    };

    const compositor = new AnimationCompositor();
    compositor.setThree(fakeThree as never);
    compositor.setLayers([layer]);

    const vrm = fakeVrm();
    for (let i = 0; i < 30; i++) compositor.update(0.016, makeContext(), vrm);

    compositor.reset();
    expect(resetCalled).toBe(true);

    // After reset, running update with empty layers should decay to near zero
    compositor.setLayers([stubLayer({})]);
    for (let i = 0; i < 300; i++) compositor.update(0.016, makeContext(), vrm);

    const val = vrm._expressions.get("happy") ?? 0;
    expect(val).toBeLessThan(0.01);
  });
});
