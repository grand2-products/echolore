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
}

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
] as const;

export async function getLlmSettings(): Promise<LlmSettings> {
  const entries = await Promise.all(
    LLM_SETTING_KEYS.map(async (key) => {
      const row = await getSiteSetting(key);
      return [key, row?.value ?? null] as const;
    }),
  );
  const map = Object.fromEntries(entries) as Record<string, string | null>;

  return {
    provider: (map.llmProvider as LlmProvider) || "google",
    geminiApiKey: map.llmGeminiApiKey || null,
    geminiTextModel: map.llmGeminiTextModel || null,
    vertexProject: map.llmVertexProject || null,
    vertexLocation: map.llmVertexLocation || null,
    vertexModel: map.llmVertexModel || null,
    zhipuApiKey: map.llmZhipuApiKey || null,
    zhipuTextModel: map.llmZhipuTextModel || null,
    zhipuUseCodingPlan: map.llmZhipuUseCodingPlan === "true",
  };
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
  };

  for (const [key, value] of Object.entries(keyMap)) {
    if (value !== undefined) {
      await upsertSiteSetting(key, value);
    }
  }

  return getLlmSettings();
}
