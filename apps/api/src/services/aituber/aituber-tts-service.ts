import { GoogleTextToSpeechGateway } from "../../ai/gateway/google/google-text-to-speech-gateway.js";

const ttsGateway = new GoogleTextToSpeechGateway();

export interface TtsSynthesisResult {
  audio: Buffer;
  mimeType: string;
}

/**
 * Synthesizes text to speech audio using Google Cloud TTS.
 * Returns base64-encoded audio suitable for sending via data channel.
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
  return {
    audio: result.audio,
    mimeType: result.mimeType,
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
