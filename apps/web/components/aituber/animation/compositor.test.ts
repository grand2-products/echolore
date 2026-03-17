import { describe, expect, it } from "vitest";
import { AnimationCompositor } from "./compositor";
import type { AnimationContext, AnimationLayer, LayerOutput } from "./types";

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

class StubLayer implements AnimationLayer {
  constructor(private output: LayerOutput) {}
  update(): LayerOutput {
    return this.output;
  }
  reset(): void {}
}

describe("AnimationCompositor", () => {
  it("clamps expression values to [0, 1]", () => {
    const compositor = new AnimationCompositor();
    compositor.addLayer(new StubLayer({ expressions: { aa: 0.8 } }));
    compositor.addLayer(new StubLayer({ expressions: { aa: 0.5 } }));

    const mockVrm = {
      expressionManager: {
        getExpression: () => ({}),
        setValue: (_name: string, _value: number) => {},
      },
      humanoid: { getNormalizedBoneNode: () => null },
    };

    // Run multiple frames to let lerp converge
    for (let i = 0; i < 60; i++) {
      compositor.update(0.016, makeContext(), mockVrm);
    }

    // aa is additive (not face group), so target is 0.8+0.5=1.3, clamped to 1.0
    // After lerp converges, value should be at 1.0
    const calls: [string, number][] = [];
    mockVrm.expressionManager.setValue = (name: string, value: number) => {
      calls.push([name, value]);
    };
    compositor.update(0.016, makeContext(), mockVrm);

    const aaCall = calls.find(([name]) => name === "aa");
    expect(aaCall).toBeDefined();
    expect(aaCall![1]).toBeLessThanOrEqual(1);
    expect(aaCall![1]).toBeGreaterThan(0.9);
  });

  it("uses max-merge for face expressions", () => {
    const compositor = new AnimationCompositor();
    compositor.addLayer(new StubLayer({ expressions: { happy: 0.3 } }));
    compositor.addLayer(new StubLayer({ expressions: { happy: 0.6 } }));

    const calls: [string, number][] = [];
    const mockVrm = {
      expressionManager: {
        getExpression: () => ({}),
        setValue: (name: string, value: number) => {
          calls.push([name, value]);
        },
      },
      humanoid: { getNormalizedBoneNode: () => null },
    };

    // Run enough frames for lerp to converge
    for (let i = 0; i < 120; i++) {
      calls.length = 0;
      compositor.update(0.016, makeContext(), mockVrm);
    }

    const happyCall = calls.find(([name]) => name === "happy");
    expect(happyCall).toBeDefined();
    // max(0.3, 0.6) = 0.6, not 0.3+0.6=0.9
    expect(happyCall![1]).toBeCloseTo(0.6, 1);
  });

  it("merges bone rotations additively", () => {
    const compositor = new AnimationCompositor();
    compositor.addLayer(new StubLayer({ boneRotations: { spine: { x: 0.01, y: 0, z: 0 } } }));
    compositor.addLayer(new StubLayer({ boneRotations: { spine: { x: 0.02, y: 0, z: 0 } } }));

    const boneValues: Record<string, { x: number; y: number; z: number }> = {};
    const mockVrm = {
      expressionManager: {
        getExpression: () => null,
        setValue: () => {},
      },
      humanoid: {
        getNormalizedBoneNode: (name: string) => ({
          rotation: { x: 0, y: 0, z: 0, w: 1 },
          quaternion: {
            setFromEuler: () => {},
          },
          get _name() {
            return name;
          },
          set x(v: number) {
            boneValues[name] = { ...boneValues[name]!, x: v };
          },
        }),
      },
    };

    for (let i = 0; i < 120; i++) {
      compositor.update(0.016, makeContext(), mockVrm);
    }

    // Target is 0.01 + 0.02 = 0.03, lerp should converge near it
  });

  it("skips locked bones from motion clip layers", () => {
    const compositor = new AnimationCompositor();
    compositor.addLayer(new StubLayer({ boneRotations: { spine: { x: 0.05, y: 0, z: 0 } } }));
    compositor.addLayer(new StubLayer({ lockedBones: new Set(["spine"]) }));

    const appliedBones: string[] = [];
    const mockVrm = {
      expressionManager: {
        getExpression: () => null,
        setValue: () => {},
      },
      humanoid: {
        getNormalizedBoneNode: (name: string) => {
          appliedBones.push(name);
          return {
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            quaternion: { setFromEuler: () => {} },
          };
        },
      },
    };

    compositor.update(0.016, makeContext(), mockVrm);

    // spine should be excluded because it's locked
    expect(appliedBones).not.toContain("spine");
  });

  it("lerps toward target values over time", () => {
    const compositor = new AnimationCompositor();
    compositor.addLayer(new StubLayer({ expressions: { aa: 1.0 } }));

    const values: number[] = [];
    const mockVrm = {
      expressionManager: {
        getExpression: () => ({}),
        setValue: (_name: string, value: number) => {
          values.push(value);
        },
      },
      humanoid: { getNormalizedBoneNode: () => null },
    };

    // First frame: should not be at target yet
    compositor.update(0.016, makeContext(), mockVrm);
    expect(values[0]).toBeGreaterThan(0);
    expect(values[0]).toBeLessThan(1);

    // After many frames: should converge
    for (let i = 0; i < 60; i++) {
      values.length = 0;
      compositor.update(0.016, makeContext(), mockVrm);
    }
    expect(values[0]).toBeGreaterThan(0.95);
  });
});
