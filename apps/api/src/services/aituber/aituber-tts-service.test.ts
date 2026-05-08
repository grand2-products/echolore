import { beforeEach, describe, expect, it, vi } from "vitest";

const { createTtsGatewayFromSettingsMock, ttsGatewayMock } = vi.hoisted(() => {
  const ttsGatewayMock = {
    synthesize: vi.fn(),
  };

  return {
    createTtsGatewayFromSettingsMock: vi.fn(async () => ({
      synthesize: ttsGatewayMock.synthesize,
    })),
    ttsGatewayMock,
  };
});

vi.mock("../../ai/providers/index.js", () => ({
  createDefaultTtsProvider: () => ({
    synthesize: ttsGatewayMock.synthesize,
  }),
  createTtsGatewayFromSettings: createTtsGatewayFromSettingsMock,
}));

import { splitIntoSentences, synthesizeSpeech, textToVisemes } from "./aituber-tts-service.js";

describe("aituber-tts-service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    ttsGatewayMock.synthesize.mockReset();
    createTtsGatewayFromSettingsMock.mockReset();
    createTtsGatewayFromSettingsMock.mockImplementation(async () => ({
      synthesize: ttsGatewayMock.synthesize,
    }));
  });

  describe("synthesizeSpeech", () => {
    it("returns audio result with visemes", async () => {
      const audioBuffer = Buffer.from("fake-audio-data");
      ttsGatewayMock.synthesize.mockResolvedValue({
        audio: audioBuffer,
        mimeType: "audio/mpeg",
      });

      const result = await synthesizeSpeech("こんにちは", "ja-JP", "ja-JP-Wavenet-A");

      expect(ttsGatewayMock.synthesize).toHaveBeenCalledWith({
        text: "こんにちは",
        languageCode: "ja-JP",
        voice: "ja-JP-Wavenet-A",
      });
      expect(result.audio).toBe(audioBuffer);
      expect(result.mimeType).toBe("audio/mpeg");
      expect(result.visemes).toBeDefined();
      expect(result.visemes.length).toBeGreaterThan(0);
    });

    it("passes undefined for voice when voiceName is null", async () => {
      ttsGatewayMock.synthesize.mockResolvedValue({
        audio: Buffer.from("audio"),
        mimeType: "audio/mpeg",
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
        mimeType: "audio/mpeg",
      });

      await synthesizeSpeech("Hello", "en-US");

      expect(ttsGatewayMock.synthesize).toHaveBeenCalledWith({
        text: "Hello",
        languageCode: "en-US",
        voice: undefined,
      });
    });

    it("throws when gateway fails", async () => {
      ttsGatewayMock.synthesize.mockRejectedValue(new Error("TTS API error"));

      await expect(synthesizeSpeech("test", "ja-JP")).rejects.toThrow("TTS API error");
    });

    it("resolves the settings gateway for each synthesis call", async () => {
      const firstSynthesize = vi.fn(async () => ({
        audio: Buffer.from("first-audio"),
        mimeType: "audio/mpeg",
      }));
      const secondSynthesize = vi.fn(async () => ({
        audio: Buffer.from("second-audio"),
        mimeType: "audio/mpeg",
      }));
      createTtsGatewayFromSettingsMock
        .mockResolvedValueOnce({ synthesize: firstSynthesize })
        .mockResolvedValueOnce({ synthesize: secondSynthesize });

      const first = await synthesizeSpeech("first", "en-US");
      const second = await synthesizeSpeech("second", "en-US");

      expect(createTtsGatewayFromSettingsMock).toHaveBeenCalledTimes(2);
      expect(first.audio.toString()).toBe("first-audio");
      expect(second.audio.toString()).toBe("second-audio");
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

      expect(visemes.length).toBe(2);
      expect(visemes[0]?.viseme).toBe("viseme_kk");
      expect(visemes[1]?.viseme).toBe("viseme_aa");
    });

    it("skips consecutive identical visemes", () => {
      const visemes = textToVisemes("ああ", "ja-JP", 1.0);

      const aaEntries = visemes.filter((v) => v.viseme === "viseme_aa");
      expect(aaEntries.length).toBe(1);
    });

    it("returns silence for empty text", () => {
      const visemes = textToVisemes("", "ja-JP", 1.0);

      expect(visemes).toEqual([{ time: 0, viseme: "viseme_sil" }]);
    });

    it("distributes visemes across audio duration", () => {
      const visemes = textToVisemes("あいうえお", "ja-JP", 2.0);

      expect(visemes.length).toBe(5);
      expect(visemes[0]?.time).toBe(0);
      expect(visemes[1]?.time).toBeCloseTo(0.4, 1);
    });

    it("handles English text", () => {
      const visemes = textToVisemes("hello", "en-US", 1.0);

      expect(visemes.length).toBeGreaterThan(0);
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
