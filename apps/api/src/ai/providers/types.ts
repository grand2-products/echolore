import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

// ---------------------------------------------------------------------------
// Embedding
// ---------------------------------------------------------------------------

export interface EmbedOptions {
  taskType?: string;
  outputDimensionality?: number;
}

export interface EmbeddingProvider {
  isAvailable(): Promise<boolean>;
  embed(text: string, options?: EmbedOptions): Promise<number[] | null>;
  getConfig(): Promise<{ model: string; dimensions: number }>;
  getModel(): Promise<string>;
  getDimensions(): Promise<number>;
  cosineSimilarity(a: number[], b: number[]): number;
}

// ---------------------------------------------------------------------------
// LLM (text generation)
// ---------------------------------------------------------------------------

export interface LlmInitOptions {
  temperature?: number;
  maxTokens?: number;
  defaultProvider?: string;
  configSetId?: string;
  feature?: "aiChat" | "aituber" | "meetingAgent";
}

export interface LlmInitResult {
  model: BaseChatModel;
  provider: string;
}

export interface LlmProvider {
  init(options?: LlmInitOptions): Promise<LlmInitResult | null>;
}

// ---------------------------------------------------------------------------
// TTS — re-export existing gateway interface
// ---------------------------------------------------------------------------

export type {
  TextToSpeechGateway,
  TextToSpeechRequest,
  TextToSpeechResult,
} from "../gateway/types.js";
