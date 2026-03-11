export type SpeechProvider = "google";

export interface SpeechToTextRequest {
  audio: Buffer;
  mimeType: string;
  languageCode: string;
  sampleRateHertz?: number;
  participantIdentity?: string;
  segmentKey?: string;
}

export interface SpeechToTextResult {
  provider: SpeechProvider;
  transcript: string;
  confidence?: number;
  isPartial: boolean;
  raw?: Record<string, unknown>;
}

export interface TextToSpeechRequest {
  text: string;
  languageCode: string;
  voice?: string;
}

export interface TextToSpeechResult {
  provider: SpeechProvider;
  audio: Buffer;
  mimeType: string;
  raw?: Record<string, unknown>;
}

export interface SpeechToTextGateway {
  readonly provider: SpeechProvider;
  transcribe(input: SpeechToTextRequest): Promise<SpeechToTextResult>;
}

export interface TextToSpeechGateway {
  readonly provider: SpeechProvider;
  synthesize(input: TextToSpeechRequest): Promise<TextToSpeechResult>;
}

export interface SpeechGatewayBundle {
  stt: SpeechToTextGateway;
  tts: TextToSpeechGateway;
}
