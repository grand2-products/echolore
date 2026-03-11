import { GoogleSpeechToTextGateway } from "./google/google-speech-to-text-gateway.js";
import { GoogleTextToSpeechGateway } from "./google/google-text-to-speech-gateway.js";
import type { SpeechGatewayBundle, SpeechProvider } from "./types.js";

const DEFAULT_PROVIDER: SpeechProvider = "google";

export function resolveSpeechProvider(provider?: string): SpeechProvider {
  if (provider === "google" || !provider) {
    return DEFAULT_PROVIDER;
  }

  throw new Error(`Unsupported speech provider: ${provider}`);
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
