import { createTypedSettingsService, FieldCodecs, field } from "./create-settings-cache.js";

export type LlmProvider = "google" | "vertex" | "zhipu" | "openai-compatible";
export type EmbeddingProvider = "google" | "vertex";

export interface LlmSettings {
  provider: LlmProvider;
  geminiApiKey: string | null;
  geminiTextModel: string | null;
  vertexProject: string | null;
  vertexLocation: string | null;
  vertexModel: string | null;
  zhipuApiKey: string | null;
  zhipuTextModel: string | null;
  zhipuUseCodingPlan: boolean;
  openaiCompatBaseUrl: string | null;
  openaiCompatApiKey: string | null;
  openaiCompatModel: string | null;
  embeddingEnabled: boolean;
  embeddingProvider: EmbeddingProvider;
  embeddingModel: string | null;
  embeddingDimensions: number | null;
}

const cache = createTypedSettingsService(
  {
    provider: field("llmProvider", FieldCodecs.withDefault<LlmProvider>("google")),
    geminiApiKey: field("llmGeminiApiKey", FieldCodecs.nullable),
    geminiTextModel: field("llmGeminiTextModel", FieldCodecs.nullable),
    vertexProject: field("llmVertexProject", FieldCodecs.nullable),
    vertexLocation: field("llmVertexLocation", FieldCodecs.nullable),
    vertexModel: field("llmVertexModel", FieldCodecs.nullable),
    zhipuApiKey: field("llmZhipuApiKey", FieldCodecs.nullable),
    zhipuTextModel: field("llmZhipuTextModel", FieldCodecs.nullable),
    zhipuUseCodingPlan: field("llmZhipuUseCodingPlan", FieldCodecs.boolFalse),
    openaiCompatBaseUrl: field("llmOpenaiCompatBaseUrl", FieldCodecs.nullable),
    openaiCompatApiKey: field("llmOpenaiCompatApiKey", FieldCodecs.nullable),
    openaiCompatModel: field("llmOpenaiCompatModel", FieldCodecs.nullable),
    embeddingEnabled: field("llmEmbeddingEnabled", FieldCodecs.boolTrue),
    embeddingProvider: field(
      "llmEmbeddingProvider",
      FieldCodecs.withDefault<EmbeddingProvider>("google")
    ),
    embeddingModel: field("llmEmbeddingModel", FieldCodecs.nullable),
    embeddingDimensions: field("llmEmbeddingDimensions", FieldCodecs.nullableNumber),
  },
  { encryptedKeys: ["llmGeminiApiKey", "llmZhipuApiKey", "llmOpenaiCompatApiKey"] }
);

export const getLlmSettings = cache.get;
export const updateLlmSettings = cache.update;
