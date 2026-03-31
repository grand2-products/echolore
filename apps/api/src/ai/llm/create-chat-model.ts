import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatVertexAI } from "@langchain/google-vertexai";
import { ChatOpenAI } from "@langchain/openai";

export type TextProvider = "google" | "vertex" | "zhipu" | "openai-compatible";

export interface LlmOverrides {
  geminiApiKey?: string | null;
  geminiTextModel?: string | null;
  vertexProject?: string | null;
  vertexLocation?: string | null;
  vertexModel?: string | null;
  zhipuApiKey?: string | null;
  zhipuTextModel?: string | null;
  zhipuUseCodingPlan?: boolean;
  openaiCompatBaseUrl?: string | null;
  openaiCompatApiKey?: string | null;
  openaiCompatModel?: string | null;
}

export function resolveTextProvider(provider?: string): TextProvider {
  if (provider === "zhipu") return "zhipu";
  if (provider === "vertex") return "vertex";
  if (provider === "openai-compatible") return "openai-compatible";
  return "google";
}

export function isTextGenerationEnabled(
  provider?: TextProvider,
  overrides?: LlmOverrides
): boolean {
  const resolved = provider ?? resolveTextProvider();
  switch (resolved) {
    case "google":
      return Boolean(overrides?.geminiApiKey);
    case "vertex":
      return Boolean(overrides?.vertexProject);
    case "zhipu":
      return Boolean(overrides?.zhipuApiKey);
    case "openai-compatible":
      return Boolean(overrides?.openaiCompatBaseUrl);
    default:
      return false;
  }
}

export function createChatModel(opts?: {
  provider?: TextProvider;
  temperature?: number;
  maxTokens?: number;
  overrides?: LlmOverrides;
}): BaseChatModel {
  const provider = opts?.provider ?? resolveTextProvider();
  const temperature = opts?.temperature ?? 0.3;
  const maxTokens = opts?.maxTokens;
  const overrides = opts?.overrides;

  switch (provider) {
    case "google":
      return new ChatGoogleGenerativeAI({
        apiKey: overrides?.geminiApiKey || undefined,
        model: overrides?.geminiTextModel || "gemini-1.5-flash",
        temperature,
        ...(maxTokens != null ? { maxOutputTokens: maxTokens } : {}),
      });
    case "vertex":
      return new ChatVertexAI({
        model: overrides?.vertexModel || "gemini-1.5-flash",
        temperature,
        ...(maxTokens != null ? { maxOutputTokens: maxTokens } : {}),
        location: overrides?.vertexLocation || "asia-northeast1",
        authOptions: {
          projectId: overrides?.vertexProject || undefined,
        },
      });
    case "zhipu": {
      const useCodingPlan = overrides?.zhipuUseCodingPlan ?? false;
      const zhipuBaseURL = useCodingPlan
        ? "https://api.z.ai/api/coding/paas/v4/"
        : "https://api.z.ai/api/paas/v4/";
      return new ChatOpenAI({
        apiKey: overrides?.zhipuApiKey || undefined,
        model: overrides?.zhipuTextModel || "glm-5",
        temperature,
        ...(maxTokens != null ? { maxTokens } : {}),
        configuration: {
          baseURL: zhipuBaseURL,
        },
      });
    }
    case "openai-compatible":
      return new ChatOpenAI({
        apiKey: overrides?.openaiCompatApiKey || "not-needed",
        model: overrides?.openaiCompatModel || "default",
        temperature,
        ...(maxTokens != null ? { maxTokens } : {}),
        configuration: {
          baseURL: overrides?.openaiCompatBaseUrl || undefined,
        },
      });
    default:
      throw new Error(`Unsupported text provider: ${provider}`);
  }
}
