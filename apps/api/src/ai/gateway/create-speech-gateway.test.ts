import { describe, expect, it } from "vitest";
import { createSpeechGatewayBundle, resolveSpeechProvider } from "./create-speech-gateway.js";

describe("create-speech-gateway", () => {
  it("keeps unsupported speech providers on the Google speech gateway bundle", () => {
    const bundle = createSpeechGatewayBundle("gemini");

    expect(resolveSpeechProvider("gemini")).toBe("google");
    expect(bundle.stt.provider).toBe("google");
    expect(bundle.tts.provider).toBe("google");
  });
});
