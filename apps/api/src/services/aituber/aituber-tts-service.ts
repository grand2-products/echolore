import type { VisemeEntry } from "@echolore/shared/contracts";
import type { GoogleTtsVoice } from "../../ai/gateway/google/google-text-to-speech-gateway.js";
import {
  createDefaultTtsProvider,
  createTtsGatewayFromSettings,
  type TextToSpeechGateway,
} from "../../ai/providers/index.js";

let ttsGateway: TextToSpeechGateway | null = null;
let useTestGateway = false;

export function _setTtsProvider(p: TextToSpeechGateway) {
  ttsGateway = p;
  useTestGateway = true;
}

export type { GoogleTtsVoice, VisemeEntry };

async function resolveGateway(): Promise<TextToSpeechGateway> {
  if (useTestGateway && ttsGateway) return ttsGateway;
  try {
    return await createTtsGatewayFromSettings();
  } catch {
    return createDefaultTtsProvider();
  }
}

export async function listVoices(languageCode?: string): Promise<GoogleTtsVoice[]> {
  const gateway = await resolveGateway();
  const g = gateway as { listVoices?: (lc?: string) => Promise<GoogleTtsVoice[]> };
  if (!g.listVoices) return [];
  return g.listVoices(languageCode);
}

export interface TtsSynthesisResult {
  audio: Buffer;
  mimeType: string;
  visemes: VisemeEntry[];
}

export async function synthesizeSpeech(
  text: string,
  languageCode: string,
  voiceName?: string | null
): Promise<TtsSynthesisResult> {
  const gateway = await resolveGateway();
  const result = await gateway.synthesize({
    text,
    languageCode,
    voice: voiceName ?? undefined,
  });

  const estimatedDuration = estimateAudioDuration(result.audio, result.mimeType);
  const visemes = textToVisemes(text, languageCode, estimatedDuration);

  return {
    audio: result.audio,
    mimeType: result.mimeType,
    visemes,
  };
}

export function splitIntoSentences(text: string): string[] {
  const sentences = text.split(/(?<=[。！？.!?\n])\s*/);
  return sentences.filter((s) => s.trim().length > 0);
}

const MP3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];

function estimateAudioDuration(buffer: Buffer, mimeType: string): number {
  if (mimeType === "audio/wav" || mimeType === "audio/wave" || mimeType === "audio/x-wav") {
    return estimateWavDuration(buffer);
  }
  return estimateMp3Duration(buffer);
}

function estimateWavDuration(buffer: Buffer): number {
  if (buffer.length < 44) return buffer.length / 48000;
  const sampleRate = buffer.readUInt32LE(24);
  const channels = buffer.readUInt16LE(22);
  const bitsPerSample = buffer.readUInt16LE(34);
  const dataSize = buffer.readUInt32LE(40);
  const bytesPerSample = (bitsPerSample / 8) * channels;
  if (bytesPerSample === 0 || sampleRate === 0) return buffer.length / 48000;
  return dataSize / (sampleRate * bytesPerSample);
}

function estimateMp3Duration(buffer: Buffer): number {
  for (let i = 0; i < Math.min(buffer.length - 4, 2048); i++) {
    if (buffer[i] === 0xff && ((buffer[i + 1] ?? 0) & 0xe0) === 0xe0) {
      const bitrateIndex = ((buffer[i + 2] ?? 0) >> 4) & 0x0f;
      const bitrate = MP3_BITRATES[bitrateIndex] ?? 0;
      if (bitrate > 0) {
        return buffer.length / (bitrate * 125);
      }
    }
  }
  return buffer.length / 4000;
}

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

const KATAKANA_START = 0x30a0;
const HIRAGANA_START = 0x3040;

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
    }
  } else {
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

  const timePerPhoneme = audioDuration / phonemes.length;
  const visemes: VisemeEntry[] = [];
  let lastViseme = "";

  for (let i = 0; i < phonemes.length; i++) {
    const phoneme = phonemes[i];
    if (!phoneme) continue;
    const viseme = PHONEME_VISEME[phoneme] ?? "viseme_sil";

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
