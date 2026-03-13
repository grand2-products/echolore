import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveTextProvider, isTextGenerationEnabled, createChatModel } from "./create-chat-model.js";

describe("resolveTextProvider", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("defaults to google when no args and no env", () => {
    delete process.env.TEXT_GENERATION_PROVIDER;
    expect(resolveTextProvider()).toBe("google");
  });

  it("returns explicit provider argument", () => {
    expect(resolveTextProvider("zhipu")).toBe("zhipu");
    expect(resolveTextProvider("vertex")).toBe("vertex");
    expect(resolveTextProvider("google")).toBe("google");
  });

  it("falls back to env TEXT_GENERATION_PROVIDER", () => {
    process.env.TEXT_GENERATION_PROVIDER = "zhipu";
    expect(resolveTextProvider()).toBe("zhipu");
  });

  it("explicit argument overrides env", () => {
    process.env.TEXT_GENERATION_PROVIDER = "zhipu";
    expect(resolveTextProvider("google")).toBe("google");
  });

  it("returns google for unknown provider strings", () => {
    expect(resolveTextProvider("unknown")).toBe("google");
  });
});

describe("isTextGenerationEnabled", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("returns true for google when GEMINI_API_KEY is set", () => {
    process.env.GEMINI_API_KEY = "test-key";
    expect(isTextGenerationEnabled("google")).toBe(true);
  });

  it("returns false for google when GEMINI_API_KEY is missing", () => {
    delete process.env.GEMINI_API_KEY;
    expect(isTextGenerationEnabled("google")).toBe(false);
  });

  it("returns true for zhipu when ZHIPU_API_KEY is set", () => {
    process.env.ZHIPU_API_KEY = "test-key";
    expect(isTextGenerationEnabled("zhipu")).toBe(true);
  });

  it("returns false for zhipu when ZHIPU_API_KEY is missing", () => {
    delete process.env.ZHIPU_API_KEY;
    expect(isTextGenerationEnabled("zhipu")).toBe(false);
  });

  it("returns true for vertex when VERTEX_PROJECT and GOOGLE_APPLICATION_CREDENTIALS are set", () => {
    process.env.VERTEX_PROJECT = "my-project";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/path/to/key.json";
    expect(isTextGenerationEnabled("vertex")).toBe(true);
  });

  it("returns false for vertex when VERTEX_PROJECT is missing", () => {
    delete process.env.VERTEX_PROJECT;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/path/to/key.json";
    expect(isTextGenerationEnabled("vertex")).toBe(false);
  });

  it("returns false for vertex when GOOGLE_APPLICATION_CREDENTIALS is missing", () => {
    process.env.VERTEX_PROJECT = "my-project";
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    expect(isTextGenerationEnabled("vertex")).toBe(false);
  });
});

describe("createChatModel", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.ZHIPU_API_KEY = "test-zhipu-key";
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("creates a Google model by default", () => {
    const model = createChatModel({ provider: "google", temperature: 0.2 });
    expect(model).toBeDefined();
  });

  it("creates a Vertex AI model", () => {
    process.env.VERTEX_PROJECT = "my-project";
    const model = createChatModel({ provider: "vertex", temperature: 0.3 });
    expect(model).toBeDefined();
  });

  it("creates a Zhipu model", () => {
    const model = createChatModel({ provider: "zhipu", temperature: 0.4 });
    expect(model).toBeDefined();
  });

  it("throws for unsupported provider", () => {
    expect(() =>
      createChatModel({ provider: "unsupported" as never, temperature: 0.3 })
    ).toThrow("Unsupported text provider");
  });
});
