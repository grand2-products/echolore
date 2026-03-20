import type { VisemeEntry } from "@echolore/shared/contracts";
import type { GoogleTtsVoice } from "../../ai/gateway/google/google-text-to-speech-gateway.js";
import { createDefaultTtsProvider, type TextToSpeechGateway } from "../../ai/providers/index.js";

let ttsGateway: TextToSpeechGateway = createDefaultTtsProvider();

/** @internal Override TTS provider (test-only) */
export function _setTtsProvider(p: TextToSpeechGateway) {
  ttsGateway = p;
}

export type { GoogleTtsVoice, VisemeEntry };

export async function listVoices(languageCode?: string): Promise<GoogleTtsVoice[]> {
  // listVoices is Google-specific; cast to access it when using default provider
  const gateway = ttsGateway as { listVoices?: (lc?: string) => Promise<GoogleTtsVoice[]> };
  if (!gateway.listVoices) return [];
  return gateway.listVoices(languageCode);
}

export interface TtsSynthesisResult {
  audio: Buffer;
  mimeType: string;
  visemes: VisemeEntry[];
}

/**
 * Synthesizes text to speech audio using Google Cloud TTS.
 * Returns audio with estimated viseme timestamps derived from text phoneme analysis.
 */
export async function synthesizeSpeech(
  text: string,
  languageCode: string,
  voiceName?: string | null
): Promise<TtsSynthesisResult> {
  const result = await ttsGateway.synthesize({
    text,
    languageCode,
    voice: voiceName ?? undefined,
  });

  // Estimate audio duration from MP3 buffer by reading the bitrate from frame header
  const estimatedDuration = estimateMp3Duration(result.audio);

  // Generate viseme sequence from text
  const visemes = textToVisemes(text, languageCode, estimatedDuration);

  return {
    audio: result.audio,
    mimeType: result.mimeType,
    visemes,
  };
}

/**
 * Splits text into sentences for incremental TTS.
 * Handles Japanese and Western punctuation.
 */
export function splitIntoSentences(text: string): string[] {
  const sentences = text.split(/(?<=[。！？.!?\n])\s*/);
  return sentences.filter((s) => s.trim().length > 0);
}

// --- Text-to-Viseme Conversion ---

// MP3 bitrate table for MPEG1 Layer 3
const MP3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];

/**
 * Estimates MP3 duration by reading the first frame header's bitrate.
 * Falls back to 4000 bytes/sec if header cannot be parsed.
 */
function estimateMp3Duration(buffer: Buffer): number {
  // Find MP3 frame sync (0xFF 0xFB/0xFA/0xF3/0xF2)
  for (let i = 0; i < Math.min(buffer.length - 4, 2048); i++) {
    if (buffer[i] === 0xff && ((buffer[i + 1] ?? 0) & 0xe0) === 0xe0) {
      const bitrateIndex = ((buffer[i + 2] ?? 0) >> 4) & 0x0f;
      const bitrate = MP3_BITRATES[bitrateIndex] ?? 0;
      if (bitrate > 0) {
        return buffer.length / (bitrate * 125); // bitrate kbps → bytes/sec = bitrate * 1000 / 8 = bitrate * 125
      }
    }
  }
  // Fallback: assume 32kbps
  return buffer.length / 4000;
}

// Hiragana → romaji phoneme mapping
const HIRAGANA_MAP: Record<string, string> = {
  あ: "a",
  い: "i",
  う: "u",
  え: "e",
  お: "o",
  か: "ka",
  き: "ki",
  く: "ku",
  け: "ke",
  こ: "ko",
  さ: "sa",
  し: "si",
  す: "su",
  せ: "se",
  そ: "so",
  た: "ta",
  ち: "ti",
  つ: "tu",
  て: "te",
  と: "to",
  な: "na",
  に: "ni",
  ぬ: "nu",
  ね: "ne",
  の: "no",
  は: "ha",
  ひ: "hi",
  ふ: "hu",
  へ: "he",
  ほ: "ho",
  ま: "ma",
  み: "mi",
  む: "mu",
  め: "me",
  も: "mo",
  や: "ya",
  ゆ: "yu",
  よ: "yo",
  ら: "ra",
  り: "ri",
  る: "ru",
  れ: "re",
  ろ: "ro",
  わ: "wa",
  を: "o",
  ん: "n",
  が: "ga",
  ぎ: "gi",
  ぐ: "gu",
  げ: "ge",
  ご: "go",
  ざ: "za",
  じ: "zi",
  ず: "zu",
  ぜ: "ze",
  ぞ: "zo",
  だ: "da",
  ぢ: "di",
  づ: "du",
  で: "de",
  ど: "do",
  ば: "ba",
  び: "bi",
  ぶ: "bu",
  べ: "be",
  ぼ: "bo",
  ぱ: "pa",
  ぴ: "pi",
  ぷ: "pu",
  ぺ: "pe",
  ぽ: "po",
};

// Katakana → hiragana offset
const KATAKANA_START = 0x30a0;
const HIRAGANA_START = 0x3040;

// Phoneme → ARKit viseme mapping
const PHONEME_VISEME: Record<string, string> = {
  a: "viseme_aa",
  i: "viseme_I",
  u: "viseme_U",
  e: "viseme_E",
  o: "viseme_O",
  n: "viseme_nn",
  k: "viseme_kk",
  g: "viseme_kk",
  s: "viseme_SS",
  z: "viseme_SS",
  t: "viseme_DD",
  d: "viseme_DD",
  h: "viseme_FF",
  b: "viseme_PP",
  p: "viseme_PP",
  m: "viseme_PP",
  r: "viseme_RR",
  y: "viseme_I",
  w: "viseme_U",
};

function katakanaToHiragana(char: string): string {
  const code = char.charCodeAt(0);
  if (code >= KATAKANA_START && code <= 0x30ff) {
    return String.fromCharCode(code - KATAKANA_START + HIRAGANA_START);
  }
  return char;
}

/**
 * Converts text to a viseme sequence with estimated timestamps.
 * For Japanese: maps kana → phonemes → visemes.
 * For other languages: maps characters to basic vowel visemes.
 */
export function textToVisemes(
  text: string,
  languageCode: string,
  audioDuration: number
): VisemeEntry[] {
  const phonemes: string[] = [];

  if (languageCode.startsWith("ja")) {
    for (const char of text) {
      const hira = katakanaToHiragana(char);
      const romaji = HIRAGANA_MAP[hira];
      if (romaji) {
        for (const c of romaji) {
          phonemes.push(c);
        }
      }
      // Skip non-kana characters (punctuation, kanji, etc.)
    }
  } else {
    // Basic English/other: extract vowels and common consonants
    for (const char of text.toLowerCase()) {
      if ("aeiou".includes(char)) {
        phonemes.push(char);
      } else if ("bcdfghjklmnpqrstvwxyz".includes(char)) {
        phonemes.push(char);
      }
    }
  }

  if (phonemes.length === 0) {
    return [{ time: 0, viseme: "viseme_sil" }];
  }

  // Distribute phonemes evenly across audio duration
  const timePerPhoneme = audioDuration / phonemes.length;
  const visemes: VisemeEntry[] = [];
  let lastViseme = "";

  for (let i = 0; i < phonemes.length; i++) {
    const phoneme = phonemes[i];
    if (!phoneme) continue;
    const viseme = PHONEME_VISEME[phoneme] ?? "viseme_sil";

    // Skip consecutive identical visemes to reduce data
    if (viseme !== lastViseme) {
      visemes.push({
        time: Math.round(i * timePerPhoneme * 1000) / 1000,
        viseme,
      });
      lastViseme = viseme;
    }
  }

  return visemes;
}
