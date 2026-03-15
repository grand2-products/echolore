import { createSettingsCache } from "./create-settings-cache.js";

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
}

const cache = createSettingsCache<LlmSettings>({
  keys: [
    "llmProvider",
    "llmGeminiApiKey",
    "llmGeminiTextModel",
    "llmVertexProject",
    "llmVertexLocation",
    "llmVertexModel",
    "llmZhipuApiKey",
    "llmZhipuTextModel",
    "llmZhipuUseCodingPlan",
    "llmEmbeddingEnabled",
    "llmEmbeddingModel",
  ],
  mapToSettings: (map) => ({
    provider: (map.llmProvider as LlmProvider) || "google",
    geminiApiKey: map.llmGeminiApiKey || null,
    geminiTextModel: map.llmGeminiTextModel || null,
    vertexProject: map.llmVertexProject || null,
    vertexLocation: map.llmVertexLocation || null,
    vertexModel: map.llmVertexModel || null,
    zhipuApiKey: map.llmZhipuApiKey || null,
    zhipuTextModel: map.llmZhipuTextModel || null,
    zhipuUseCodingPlan: map.llmZhipuUseCodingPlan === "true",
    embeddingEnabled: map.llmEmbeddingEnabled !== "false",
    embeddingModel: map.llmEmbeddingModel || null,
  }),
  mapToKeyValues: (input) => ({
    llmProvider: input.provider,
    llmGeminiApiKey: input.geminiApiKey ?? undefined,
    llmGeminiTextModel: input.geminiTextModel ?? undefined,
    llmVertexProject: input.vertexProject ?? undefined,
    llmVertexLocation: input.vertexLocation ?? undefined,
    llmVertexModel: input.vertexModel ?? undefined,
    llmZhipuApiKey: input.zhipuApiKey ?? undefined,
    llmZhipuTextModel: input.zhipuTextModel ?? undefined,
    llmZhipuUseCodingPlan:
      input.zhipuUseCodingPlan !== undefined ? String(input.zhipuUseCodingPlan) : undefined,
    llmEmbeddingEnabled:
      input.embeddingEnabled !== undefined ? String(input.embeddingEnabled) : undefined,
    llmEmbeddingModel: input.embeddingModel ?? undefined,
  }),
});

export const getLlmSettings = cache.get;
export const updateLlmSettings = cache.update;
