import { getTtsSettings, type TtsProvider } from "../../services/admin/tts-settings-service.js";
import { GeminiTextToSpeechGateway } from "./gemini/gemini-text-to-speech-gateway.js";
import { GoogleSpeechToTextGateway } from "./google/google-speech-to-text-gateway.js";
import { GoogleTextToSpeechGateway } from "./google/google-text-to-speech-gateway.js";
import type { SpeechGatewayBundle, SpeechProvider, TextToSpeechGateway } from "./types.js";

export function resolveSpeechProvider(provider?: string): SpeechProvider {
  if (provider === "google" || !provider) {
    return "google";
  }
  return "google";
}

export function createSpeechGatewayBundle(provider?: string): SpeechGatewayBundle {
  const resolvedProvider = resolveSpeechProvider(provider);

  switch (resolvedProvider) {
    case "google":
      return {
        stt: new GoogleSpeechToTextGateway(),
        tts: new GoogleTextToSpeechGateway(),
      };
    default:
      return {
        stt: new GoogleSpeechToTextGateway(),
        tts: new GoogleTextToSpeechGateway(),
      };
  }
}

export async function createTtsGatewayFromSettings(): Promise<TextToSpeechGateway> {
  const settings = await getTtsSettings();

  if (settings.provider === "gemini" && settings.geminiApiKey) {
    return new GeminiTextToSpeechGateway({
      apiKey: settings.geminiApiKey,
      model: settings.geminiModel || undefined,
      voiceName: settings.geminiVoiceName || undefined,
    });
  }

  return new GoogleTextToSpeechGateway();
}

export function resolveTtsProviderFromSettings(provider?: TtsProvider): SpeechProvider {
  return provider === "gemini" ? "gemini" : "google";
}
