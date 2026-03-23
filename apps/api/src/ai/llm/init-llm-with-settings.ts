import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { getLlmSettings } from "../../services/admin/llm-settings-service.js";
import type { LlmOverrides, TextProvider } from "./create-chat-model.js";
import {
  createChatModel,
  isTextGenerationEnabled,
  resolveTextProvider,
} from "./create-chat-model.js";

export interface InitLlmResult {
  model: BaseChatModel;
  provider: TextProvider;
  overrides: LlmOverrides;
}

/**
 * Map LLM settings from the database to the `LlmOverrides` shape
 * used by `createChatModel` / `isTextGenerationEnabled`.
 */
export function mapToOverrides(dbSettings: {
  geminiApiKey: string | null;
  geminiTextModel: string | null;
  vertexProject: string | null;
  vertexLocation: string | null;
  vertexModel: string | null;
  zhipuApiKey: string | null;
  zhipuTextModel: string | null;
  zhipuUseCodingPlan?: boolean;
}): LlmOverrides {
  return {
    geminiApiKey: dbSettings.geminiApiKey,
    geminiTextModel: dbSettings.geminiTextModel,
    vertexProject: dbSettings.vertexProject,
    vertexLocation: dbSettings.vertexLocation,
    vertexModel: dbSettings.vertexModel,
    zhipuApiKey: dbSettings.zhipuApiKey,
    zhipuTextModel: dbSettings.zhipuTextModel,
    zhipuUseCodingPlan: dbSettings.zhipuUseCodingPlan,
  };
}

/**
 * Shared helper that encapsulates the repeated LLM initialisation pattern:
 *
 * 1. Fetch `LlmSettings` from the database
 * 2. Map settings to `LlmOverrides`
 * 3. Resolve the text provider
 * 4. Guard against disabled providers
 * 5. Build the `BaseChatModel`
 *
 * Returns `null` when the resolved provider is not enabled so callers can
 * fall back gracefully.
 */
export async function initLlmWithSettings(options?: {
  temperature?: number;
  maxTokens?: number;
  defaultProvider?: string;
}): Promise<InitLlmResult | null> {
  const dbSettings = await getLlmSettings();
  const overrides = mapToOverrides(dbSettings);
  const provider = resolveTextProvider(options?.defaultProvider ?? dbSettings.provider);

  if (!isTextGenerationEnabled(provider, overrides)) {
    return null;
  }

  const model = createChatModel({
    provider,
    temperature: options?.temperature,
    maxTokens: options?.maxTokens,
    overrides,
  });

  return { model, provider, overrides };
}

/**
 * Lightweight check: is text generation configured & enabled?
 * Only reads DB settings — does not instantiate a model.
 */
export async function isLlmAvailable(): Promise<boolean> {
  const dbSettings = await getLlmSettings();
  const overrides = mapToOverrides(dbSettings);
  const provider = resolveTextProvider(dbSettings.provider);
  return isTextGenerationEnabled(provider, overrides);
}
