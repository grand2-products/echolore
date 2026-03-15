import {
  getSiteSetting,
  upsertSiteSetting,
} from "../../repositories/admin/admin-repository.js";

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

const CACHE_TTL_MS = 60_000;
let cachedLlmSettings: LlmSettings | null = null;
let cacheExpiresAt = 0;

const LLM_SETTING_KEYS = [
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
] as const;

export async function getLlmSettings(): Promise<LlmSettings> {
  const now = Date.now();
  if (cachedLlmSettings && now < cacheExpiresAt) {
    return cachedLlmSettings;
  }

  const entries = await Promise.all(
    LLM_SETTING_KEYS.map(async (key) => {
      const row = await getSiteSetting(key);
      return [key, row?.value ?? null] as const;
    }),
  );
  const map = Object.fromEntries(entries) as Record<string, string | null>;

  const settings: LlmSettings = {
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
  };

  cachedLlmSettings = settings;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return settings;
}

function invalidateLlmSettingsCache() {
  cachedLlmSettings = null;
  cacheExpiresAt = 0;
}

export async function updateLlmSettings(input: Partial<LlmSettings>) {
  const keyMap: Record<string, string | undefined> = {
    llmProvider: input.provider,
    llmGeminiApiKey: input.geminiApiKey ?? undefined,
    llmGeminiTextModel: input.geminiTextModel ?? undefined,
    llmVertexProject: input.vertexProject ?? undefined,
    llmVertexLocation: input.vertexLocation ?? undefined,
    llmVertexModel: input.vertexModel ?? undefined,
    llmZhipuApiKey: input.zhipuApiKey ?? undefined,
    llmZhipuTextModel: input.zhipuTextModel ?? undefined,
    llmZhipuUseCodingPlan: input.zhipuUseCodingPlan !== undefined ? String(input.zhipuUseCodingPlan) : undefined,
    llmEmbeddingEnabled: input.embeddingEnabled !== undefined ? String(input.embeddingEnabled) : undefined,
    llmEmbeddingModel: input.embeddingModel ?? undefined,
  };

  for (const [key, value] of Object.entries(keyMap)) {
    if (value !== undefined) {
      await upsertSiteSetting(key, value);
    }
  }

  invalidateLlmSettingsCache();
  return getLlmSettings();
}
