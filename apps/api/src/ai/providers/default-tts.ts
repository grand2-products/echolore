import { GoogleTextToSpeechGateway } from "../gateway/google/google-text-to-speech-gateway.js";
import type { TextToSpeechGateway } from "./types.js";

export function createDefaultTtsProvider(): TextToSpeechGateway {
  return new GoogleTextToSpeechGateway();
}
