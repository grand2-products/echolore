import { describe, expect, it } from "vitest";
import { MotionClipLayer } from "./motion-clip-layer";
import type { AnimationContext } from "./types";

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

describe("MotionClipLayer", () => {
  it("returns empty output when no clip is playing", () => {
    const layer = new MotionClipLayer();
    const output = layer.update(0.016, makeContext());

    expect(output.lockedBones).toBeUndefined();
  });

  it("returns lockedBones when a clip is playing", () => {
    const layer = new MotionClipLayer();

    // Mock mixer
    const actionRunning = true;
    const mockAction = {
      reset: () => mockAction,
      fadeIn: () => mockAction,
      fadeOut: () => mockAction,
      setLoop: () => mockAction,
      play: () => mockAction,
      isRunning: () => actionRunning,
    };
    const mockMixer = {
      clipAction: () => mockAction,
      stopAllAction: () => {},
      update: () => {},
    };

    // Inject mock mixer via initialize
    const mockVrm = { scene: {} };
    const mockTHREE = {
      AnimationMixer: class {
        clipAction = mockMixer.clipAction;
        stopAllAction = mockMixer.stopAllAction;
        update = mockMixer.update;
      },
    };
    layer.initialize(mockVrm, mockTHREE);

    // Add a clip and play it
    layer.addClip("test-clip", {});
    layer.setManifest([
      {
        id: "test-clip",
        file: "test.vrma",
        category: "test",
        description: "Test clip",
        tags: [],
        duration: 1.0,
        loop: false,
      },
    ]);

    // Trigger play via context action
    const output = layer.update(0.016, makeContext({ action: "test-clip" }));

    expect(output.lockedBones).toBeDefined();
    expect(output.lockedBones?.has("spine")).toBe(true);
    expect(output.lockedBones?.has("head")).toBe(true);
    expect(output.lockedBones?.has("rightUpperArm")).toBe(true);
  });

  it("clears lockedBones when action finishes", () => {
    const layer = new MotionClipLayer();

    let actionRunning = true;
    const mockAction = {
      reset: () => mockAction,
      fadeIn: () => mockAction,
      fadeOut: () => mockAction,
      setLoop: () => mockAction,
      play: () => mockAction,
      isRunning: () => actionRunning,
    };
    const mockMixer = {
      clipAction: () => mockAction,
      stopAllAction: () => {},
      update: () => {},
    };

    const mockVrm = { scene: {} };
    const mockTHREE = {
      AnimationMixer: class {
        clipAction = mockMixer.clipAction;
        stopAllAction = mockMixer.stopAllAction;
        update = mockMixer.update;
      },
    };
    layer.initialize(mockVrm, mockTHREE);
    layer.addClip("test-clip", {});

    // Play clip
    layer.update(0.016, makeContext({ action: "test-clip" }));
    expect(layer.update(0.016, makeContext({ action: "test-clip" })).lockedBones).toBeDefined();

    // Action finishes
    actionRunning = false;
    const output = layer.update(0.016, makeContext());
    expect(output.lockedBones).toBeUndefined();
  });

  it("does not play unknown clip IDs", () => {
    const layer = new MotionClipLayer();

    const mockVrm = { scene: {} };
    const mockTHREE = {
      AnimationMixer: class {
        clipAction = () => ({
          reset: () => ({}),
          fadeIn: () => ({}),
          play: () => ({}),
          isRunning: () => false,
        });
        stopAllAction = () => {};
        update = () => {};
      },
    };
    layer.initialize(mockVrm, mockTHREE);

    // Try to play a clip that doesn't exist
    const output = layer.update(0.016, makeContext({ action: "nonexistent" }));
    expect(output.lockedBones).toBeUndefined();
  });

  it("resets all state", () => {
    const layer = new MotionClipLayer();
    const mockVrm = { scene: {} };
    const mockTHREE = {
      AnimationMixer: class {
        clipAction = () => ({
          reset: () => ({}),
          fadeIn: () => ({}),
          play: () => ({}),
          isRunning: () => true,
        });
        stopAllAction = () => {};
        update = () => {};
      },
    };
    layer.initialize(mockVrm, mockTHREE);

    layer.reset();
    const output = layer.update(0.016, makeContext());
    expect(output.lockedBones).toBeUndefined();
  });
});
