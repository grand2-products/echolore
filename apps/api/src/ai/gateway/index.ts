export { createSpeechGatewayBundle, resolveSpeechProvider } from "./create-speech-gateway.js";
export { getGoogleCloudAccessToken } from "./google/google-cloud-auth.js";
export { GoogleSpeechToTextGateway } from "./google/google-speech-to-text-gateway.js";
export { GoogleTextToSpeechGateway } from "./google/google-text-to-speech-gateway.js";
export type {
  SpeechGatewayBundle,
  SpeechProvider,
  SpeechToTextGateway,
  SpeechToTextRequest,
  SpeechToTextResult,
  TextToSpeechGateway,
  TextToSpeechRequest,
  TextToSpeechResult,
} from "./types.js";
