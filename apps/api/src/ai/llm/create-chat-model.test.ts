import { describe, expect, it } from "vitest";
import {
  createChatModel,
  isTextGenerationEnabled,
  resolveTextProvider,
} from "./create-chat-model.js";

describe("resolveTextProvider", () => {
  it("defaults to google when no args", () => {
    expect(resolveTextProvider()).toBe("google");
  });

  it("returns explicit provider argument", () => {
    expect(resolveTextProvider("zhipu")).toBe("zhipu");
    expect(resolveTextProvider("vertex")).toBe("vertex");
    expect(resolveTextProvider("google")).toBe("google");
  });

  it("returns google for unknown provider strings", () => {
    expect(resolveTextProvider("unknown")).toBe("google");
  });
});

describe("isTextGenerationEnabled", () => {
  it("returns true for google when geminiApiKey override is set", () => {
    expect(isTextGenerationEnabled("google", { geminiApiKey: "test-key" })).toBe(true);
  });

  it("returns false for google when no override", () => {
    expect(isTextGenerationEnabled("google")).toBe(false);
  });

  it("returns true for zhipu when zhipuApiKey override is set", () => {
    expect(isTextGenerationEnabled("zhipu", { zhipuApiKey: "test-key" })).toBe(true);
  });

  it("returns false for zhipu when no override", () => {
    expect(isTextGenerationEnabled("zhipu")).toBe(false);
  });

  it("returns true for vertex when vertexProject override is set", () => {
    expect(isTextGenerationEnabled("vertex", { vertexProject: "my-project" })).toBe(true);
  });

  it("returns false for vertex when no override", () => {
    expect(isTextGenerationEnabled("vertex")).toBe(false);
  });
});

describe("createChatModel", () => {
  it("creates a Google model", () => {
    const model = createChatModel({
      provider: "google",
      temperature: 0.2,
      overrides: { geminiApiKey: "test-key" },
    });
    expect(model).toBeDefined();
  });

  it("creates a Vertex AI model", () => {
    const model = createChatModel({
      provider: "vertex",
      temperature: 0.3,
      overrides: { vertexProject: "my-project" },
    });
    expect(model).toBeDefined();
  });

  it("creates a Zhipu model", () => {
    const model = createChatModel({
      provider: "zhipu",
      temperature: 0.4,
      overrides: { zhipuApiKey: "test-key" },
    });
    expect(model).toBeDefined();
  });

  it("throws for unsupported provider", () => {
    expect(() => createChatModel({ provider: "unsupported" as never, temperature: 0.3 })).toThrow(
      "Unsupported text provider"
    );
  });
});
