import { GoogleSpeechToTextGateway } from "./google/google-speech-to-text-gateway.js";
import { GoogleTextToSpeechGateway } from "./google/google-text-to-speech-gateway.js";
import type { SpeechGatewayBundle, SpeechProvider } from "./types.js";

const DEFAULT_PROVIDER: SpeechProvider = "google";

export function resolveSpeechProvider(provider?: string): SpeechProvider {
  if (provider === "google" || !provider) {
    return DEFAULT_PROVIDER;
  }

  // Non-speech providers (vertex, zhipu, openai-compatible) fall back to Google
  // since they don't have their own STT/TTS implementations.
  return DEFAULT_PROVIDER;
}

export function createSpeechGatewayBundle(provider?: string): SpeechGatewayBundle {
  const resolvedProvider = resolveSpeechProvider(provider);

  switch (resolvedProvider) {
    case "google":
      return {
        stt: new GoogleSpeechToTextGateway(),
        tts: new GoogleTextToSpeechGateway(),
      };
  }
}
