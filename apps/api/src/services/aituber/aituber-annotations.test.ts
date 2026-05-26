import { beforeEach, describe, expect, it } from "vitest";
import { parseAnnotations } from "./aituber-annotations.js";
import { _seedMotionRegistry, clearMotionRegistryCache } from "./motion-registry.js";

/**
 * `parseAnnotations` depends synchronously on the motion-registry cache to
 * validate `[action:ID]` tags. We seed it without touching the filesystem so
 * the tests are hermetic.
 */
const TEST_MOTION_MANIFEST = {
  clips: [
    "greeting-bow-polite",
    "greeting-wave-casual",
    "farewell-wave",
    "nod-gentle-1",
    "head-tilt-curious",
    "laugh-mid",
    "laugh-shy",
    "surprise-mid",
    "sad-mid",
    "angry-mid",
    "think-chin-hand",
    "explain-point",
    "react-impressed",
    "react-embarrassed",
    "idle-stretch",
  ].map((id) => ({
    id,
    file: `${id}.vrma`,
    category: id.split("-")[0] ?? "misc",
    description: id,
  })),
};

describe("parseAnnotations", () => {
  beforeEach(() => {
    clearMotionRegistryCache();
    _seedMotionRegistry(TEST_MOTION_MANIFEST);
  });

  it("parses emotion and action tags", () => {
    const result = parseAnnotations("[emotion:happy:0.7][action:greeting-wave-casual] やっほー！");
    expect(result.emotion).toEqual({ type: "happy", intensity: 0.7 });
    expect(result.action).toBe("greeting-wave-casual");
    expect(result.text).toBe("やっほー！");
  });

  it("parses emotion only", () => {
    const result = parseAnnotations("[emotion:sad:0.4] 悲しいね");
    expect(result.emotion).toEqual({ type: "sad", intensity: 0.4 });
    expect(result.action).toBeNull();
    expect(result.text).toBe("悲しいね");
  });

  it("returns null emotion for missing tag", () => {
    const result = parseAnnotations("普通の応答です");
    expect(result.emotion).toBeNull();
    expect(result.action).toBeNull();
    expect(result.text).toBe("普通の応答です");
  });

  it("clamps intensity to [0, 1]", () => {
    const result = parseAnnotations("[emotion:angry:1.5] 怒った！");
    expect(result.emotion?.intensity).toBe(1);
  });

  it("rejects invalid emotion types", () => {
    const result = parseAnnotations("[emotion:rage:0.8] 怒った！");
    expect(result.emotion).toBeNull();
  });

  it("only matches tag at the beginning of text", () => {
    const result = parseAnnotations("途中に [emotion:happy:0.5] がある");
    expect(result.emotion).toBeNull();
    expect(result.text).toBe("途中に [emotion:happy:0.5] がある");
  });

  it("handles tag without trailing space", () => {
    const result = parseAnnotations("[emotion:sad:0.3]悲しいです");
    expect(result.emotion).toEqual({ type: "sad", intensity: 0.3 });
    expect(result.text).toBe("悲しいです");
  });

  it("parses action with hyphens in ID", () => {
    const result = parseAnnotations("[emotion:neutral:0.0][action:nod-gentle-1] うん");
    expect(result.action).toBe("nod-gentle-1");
  });

  it("rejects invalid action IDs not in registry", () => {
    const result = parseAnnotations("[emotion:happy:0.5][action:dance-backflip] テスト");
    expect(result.action).toBeNull();
    expect(result.text).toBe("テスト");
  });

  it("accepts all registered action IDs", () => {
    for (const id of [
      "greeting-bow-polite",
      "farewell-wave",
      "nod-gentle-1",
      "head-tilt-curious",
      "laugh-mid",
      "laugh-shy",
      "surprise-mid",
      "sad-mid",
      "angry-mid",
      "think-chin-hand",
      "explain-point",
      "react-impressed",
      "react-embarrassed",
      "idle-stretch",
    ]) {
      const result = parseAnnotations(`[emotion:neutral:0.0][action:${id}] test`);
      expect(result.action).toBe(id);
    }
  });

  it("strips duplicated emotion tags the LLM may leave trailing", () => {
    const result = parseAnnotations("[emotion:happy:0.7][emotion:happy:0.7] こんにちは");
    expect(result.emotion).toEqual({ type: "happy", intensity: 0.7 });
    expect(result.text).toBe("こんにちは");
  });

  it("drops the action tag when the motion registry hasn't loaded", () => {
    // Simulate a cold worker that never called loadMotionRegistry().
    clearMotionRegistryCache();
    const result = parseAnnotations("[emotion:happy:0.5][action:nod-gentle-1] hi");
    expect(result.action).toBeNull();
    expect(result.emotion).toEqual({ type: "happy", intensity: 0.5 });
  });
});
