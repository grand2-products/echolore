import { beforeEach, describe, expect, it, vi } from "vitest";

const { ttsGatewayMock } = vi.hoisted(() => ({
  ttsGatewayMock: {
    synthesize: vi.fn(),
  },
}));

vi.mock("../../ai/gateway/google/google-text-to-speech-gateway.js", () => ({
  GoogleTextToSpeechGateway: class MockGoogleTextToSpeechGateway {
    synthesize = ttsGatewayMock.synthesize;
  },
}));

import { splitIntoSentences, synthesizeSpeech } from "./aituber-tts-service.js";

describe("aituber-tts-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    ttsGatewayMock.synthesize.mockReset();
  });

  describe("synthesizeSpeech", () => {
    it("calls gateway with correct parameters and returns audio result", async () => {
      const audioBuffer = Buffer.from("fake-audio-data");
      ttsGatewayMock.synthesize.mockResolvedValue({
        audio: audioBuffer,
        mimeType: "audio/mp3",
      });

      const result = await synthesizeSpeech("こんにちは", "ja-JP", "ja-JP-Wavenet-A");

      expect(ttsGatewayMock.synthesize).toHaveBeenCalledWith({
        text: "こんにちは",
        languageCode: "ja-JP",
        voice: "ja-JP-Wavenet-A",
      });
      expect(result).toEqual({
        audio: audioBuffer,
        mimeType: "audio/mp3",
      });
    });

    it("passes undefined for voice when voiceName is null", async () => {
      ttsGatewayMock.synthesize.mockResolvedValue({
        audio: Buffer.from("audio"),
        mimeType: "audio/mp3",
      });

      await synthesizeSpeech("Hello", "en-US", null);

      expect(ttsGatewayMock.synthesize).toHaveBeenCalledWith({
        text: "Hello",
        languageCode: "en-US",
        voice: undefined,
      });
    });

    it("passes undefined for voice when voiceName is not provided", async () => {
      ttsGatewayMock.synthesize.mockResolvedValue({
        audio: Buffer.from("audio"),
        mimeType: "audio/mp3",
      });

      await synthesizeSpeech("Hello", "en-US");

      expect(ttsGatewayMock.synthesize).toHaveBeenCalledWith({
        text: "Hello",
        languageCode: "en-US",
        voice: undefined,
      });
    });

    it("throws when gateway fails", async () => {
      ttsGatewayMock.synthesize.mockRejectedValue(new Error("Google TTS API error"));

      await expect(synthesizeSpeech("test", "ja-JP")).rejects.toThrow("Google TTS API error");
    });
  });

  describe("splitIntoSentences", () => {
    it("splits Japanese sentences by 。！？", () => {
      const result = splitIntoSentences("こんにちは。元気ですか？はい！");
      expect(result).toEqual(["こんにちは。", "元気ですか？", "はい！"]);
    });

    it("splits English sentences by . ! ?", () => {
      const result = splitIntoSentences("Hello. How are you? Great!");
      expect(result).toEqual(["Hello.", "How are you?", "Great!"]);
    });

    it("handles mixed punctuation", () => {
      const result = splitIntoSentences("すごい！That is amazing.");
      expect(result).toEqual(["すごい！", "That is amazing."]);
    });

    it("filters out empty strings", () => {
      const result = splitIntoSentences("Hello.   ");
      expect(result).toEqual(["Hello."]);
    });

    it("returns single item for text without sentence-ending punctuation", () => {
      const result = splitIntoSentences("No punctuation here");
      expect(result).toEqual(["No punctuation here"]);
    });

    it("returns empty array for empty string", () => {
      const result = splitIntoSentences("");
      expect(result).toEqual([]);
    });

    it("splits on newlines", () => {
      const result = splitIntoSentences("Line one\nLine two");
      expect(result).toEqual(["Line one\n", "Line two"]);
    });
  });
});
