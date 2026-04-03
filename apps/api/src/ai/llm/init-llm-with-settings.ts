import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  getConfigSetById,
  type LlmFeature,
  resolveConfigSetForFeature,
} from "../../services/admin/llm-config-set-service.js";
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
  openaiCompatBaseUrl?: string | null;
  openaiCompatApiKey?: string | null;
  openaiCompatModel?: string | null;
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
    openaiCompatBaseUrl: dbSettings.openaiCompatBaseUrl,
    openaiCompatApiKey: dbSettings.openaiCompatApiKey,
    openaiCompatModel: dbSettings.openaiCompatModel,
  };
}

/** Resolve a config-set-like object into overrides + provider. */
function resolveFromSettings(
  settings: Parameters<typeof mapToOverrides>[0] & { provider: string }
): {
  overrides: LlmOverrides;
  provider: TextProvider;
} {
  return {
    overrides: mapToOverrides(settings),
    provider: resolveTextProvider(settings.provider),
  };
}

/**
 * Shared helper that encapsulates the repeated LLM initialisation pattern.
 *
 * Resolution order:
 * 1. `configSetId` — load that specific config set
 * 2. `feature` — resolve via feature-to-config-set assignment
 * 3. `defaultProvider` (legacy) — fall back to global site_settings
 * 4. Otherwise — load the "default" config set
 *
 * Returns `null` when the resolved provider is not enabled.
 */
export async function initLlmWithSettings(options?: {
  temperature?: number;
  maxTokens?: number;
  defaultProvider?: string;
  configSetId?: string;
  feature?: LlmFeature;
}): Promise<InitLlmResult | null> {
  let resolved: { overrides: LlmOverrides; provider: TextProvider } | null = null;

  if (options?.configSetId) {
    const configSet = await getConfigSetById(options.configSetId);
    if (configSet) {
      resolved = resolveFromSettings(configSet);
    } else if (options.feature) {
      const featureSet = await resolveConfigSetForFeature(options.feature);
      if (featureSet) resolved = resolveFromSettings(featureSet);
    }
  } else if (options?.feature) {
    const configSet = await resolveConfigSetForFeature(options.feature);
    if (configSet) resolved = resolveFromSettings(configSet);
  } else if (options?.defaultProvider) {
    const dbSettings = await getLlmSettings();
    resolved = {
      overrides: mapToOverrides(dbSettings),
      provider: resolveTextProvider(options.defaultProvider),
    };
  } else {
    const configSet = await getConfigSetById("default");
    if (configSet) {
      resolved = resolveFromSettings(configSet);
    } else {
      const dbSettings = await getLlmSettings();
      resolved = resolveFromSettings(dbSettings);
    }
  }

  if (!resolved || !isTextGenerationEnabled(resolved.provider, resolved.overrides)) {
    return null;
  }

  const { overrides, provider } = resolved;

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
  const configSet = await getConfigSetById("default");
  const { overrides, provider } = configSet
    ? resolveFromSettings(configSet)
    : resolveFromSettings(await getLlmSettings());
  return isTextGenerationEnabled(provider, overrides);
}
