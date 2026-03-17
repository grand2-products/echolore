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

import { splitIntoSentences, synthesizeSpeech, textToVisemes } from "./aituber-tts-service.js";

describe("aituber-tts-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    ttsGatewayMock.synthesize.mockReset();
  });

  describe("synthesizeSpeech", () => {
    it("returns audio result with visemes", async () => {
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
      expect(result.audio).toBe(audioBuffer);
      expect(result.mimeType).toBe("audio/mp3");
      expect(result.visemes).toBeDefined();
      expect(result.visemes.length).toBeGreaterThan(0);
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

  describe("textToVisemes", () => {
    it("generates visemes from Japanese hiragana", () => {
      const visemes = textToVisemes("あいう", "ja-JP", 1.0);

      expect(visemes.length).toBeGreaterThan(0);
      expect(visemes[0]?.viseme).toBe("viseme_aa");
      expect(visemes[0]?.time).toBe(0);
    });

    it("maps katakana to visemes", () => {
      const visemes = textToVisemes("アイウ", "ja-JP", 1.0);

      expect(visemes.length).toBeGreaterThan(0);
      expect(visemes[0]?.viseme).toBe("viseme_aa");
    });

    it("generates consonant + vowel visemes for syllables", () => {
      const visemes = textToVisemes("か", "ja-JP", 0.5);

      // か = k + a → viseme_kk, viseme_aa
      expect(visemes.length).toBe(2);
      expect(visemes[0]?.viseme).toBe("viseme_kk");
      expect(visemes[1]?.viseme).toBe("viseme_aa");
    });

    it("skips consecutive identical visemes", () => {
      const visemes = textToVisemes("ああ", "ja-JP", 1.0);

      // Two 'a' phonemes → only one viseme_aa entry
      const aaEntries = visemes.filter((v) => v.viseme === "viseme_aa");
      expect(aaEntries.length).toBe(1);
    });

    it("returns silence for empty text", () => {
      const visemes = textToVisemes("", "ja-JP", 1.0);

      expect(visemes).toEqual([{ time: 0, viseme: "viseme_sil" }]);
    });

    it("distributes visemes across audio duration", () => {
      const visemes = textToVisemes("あいうえお", "ja-JP", 2.0);

      // 5 phonemes over 2 seconds = 0.4s each
      expect(visemes.length).toBe(5);
      expect(visemes[0]?.time).toBe(0);
      expect(visemes[1]?.time).toBeCloseTo(0.4, 1);
    });

    it("handles English text", () => {
      const visemes = textToVisemes("hello", "en-US", 1.0);

      expect(visemes.length).toBeGreaterThan(0);
      // 'h' → viseme_FF, 'e' → viseme_E, 'l' → ?, 'l' → skip, 'o' → viseme_O
    });

    it("handles ん as nasal viseme", () => {
      const visemes = textToVisemes("ん", "ja-JP", 0.5);

      expect(visemes[0]?.viseme).toBe("viseme_nn");
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
