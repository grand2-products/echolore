import { createTypedSettingsService, FieldCodecs, field } from "./create-settings-cache.js";

export type LlmProvider = "google" | "vertex" | "zhipu";

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
  embeddingEnabled: boolean;
  embeddingModel: string | null;
  embeddingDimensions: number | null;
}

const cache = createTypedSettingsService({
  provider: field("llmProvider", FieldCodecs.withDefault<LlmProvider>("google")),
  geminiApiKey: field("llmGeminiApiKey", FieldCodecs.nullable),
  geminiTextModel: field("llmGeminiTextModel", FieldCodecs.nullable),
  vertexProject: field("llmVertexProject", FieldCodecs.nullable),
  vertexLocation: field("llmVertexLocation", FieldCodecs.nullable),
  vertexModel: field("llmVertexModel", FieldCodecs.nullable),
  zhipuApiKey: field("llmZhipuApiKey", FieldCodecs.nullable),
  zhipuTextModel: field("llmZhipuTextModel", FieldCodecs.nullable),
  zhipuUseCodingPlan: field("llmZhipuUseCodingPlan", FieldCodecs.boolFalse),
  embeddingEnabled: field("llmEmbeddingEnabled", FieldCodecs.boolTrue),
  embeddingModel: field("llmEmbeddingModel", FieldCodecs.nullable),
  embeddingDimensions: field("llmEmbeddingDimensions", FieldCodecs.nullableNumber),
});

export const getLlmSettings = cache.get;
export const updateLlmSettings = cache.update;
