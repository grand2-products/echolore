import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatVertexAI } from "@langchain/google-vertexai";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export type TextProvider = "google" | "vertex" | "zhipu";

export interface LlmOverrides {
  geminiApiKey?: string | null;
  geminiTextModel?: string | null;
  vertexProject?: string | null;
  vertexLocation?: string | null;
  vertexModel?: string | null;
  zhipuApiKey?: string | null;
  zhipuTextModel?: string | null;
  zhipuUseCodingPlan?: boolean;
}

export function resolveTextProvider(provider?: string): TextProvider {
  if (provider === "zhipu") return "zhipu";
  if (provider === "vertex") return "vertex";
  if (provider === "google") return "google";
  const envProvider = process.env.TEXT_GENERATION_PROVIDER;
  if (envProvider === "zhipu") return "zhipu";
  if (envProvider === "vertex") return "vertex";
  return "google";
}

export function isTextGenerationEnabled(
  provider?: TextProvider,
  overrides?: LlmOverrides,
): boolean {
  const resolved = provider ?? resolveTextProvider();
  switch (resolved) {
    case "google":
      return Boolean(overrides?.geminiApiKey || process.env.GEMINI_API_KEY);
    case "vertex":
      return Boolean(
        (overrides?.vertexProject || process.env.VERTEX_PROJECT) &&
        process.env.GOOGLE_APPLICATION_CREDENTIALS,
      );
    case "zhipu":
      return Boolean(overrides?.zhipuApiKey || process.env.ZHIPU_API_KEY);
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
        apiKey: overrides?.geminiApiKey || process.env.GEMINI_API_KEY,
        model: overrides?.geminiTextModel || process.env.GEMINI_TEXT_MODEL || "gemini-1.5-flash",
        temperature,
        ...(maxTokens != null ? { maxOutputTokens: maxTokens } : {}),
      });
    case "vertex":
      return new ChatVertexAI({
        model: overrides?.vertexModel || process.env.VERTEX_MODEL || "gemini-1.5-flash",
        temperature,
        ...(maxTokens != null ? { maxOutputTokens: maxTokens } : {}),
        location: overrides?.vertexLocation || process.env.VERTEX_LOCATION || "asia-northeast1",
        authOptions: {
          projectId: overrides?.vertexProject || process.env.VERTEX_PROJECT || undefined,
        },
      });
    case "zhipu": {
      const useCodingPlan = overrides?.zhipuUseCodingPlan ?? process.env.ZHIPU_USE_CODING_PLAN === "true";
      const zhipuBaseURL = useCodingPlan
        ? "https://api.z.ai/api/coding/paas/v4/"
        : "https://api.z.ai/api/paas/v4/";
      return new ChatOpenAI({
        apiKey: overrides?.zhipuApiKey || process.env.ZHIPU_API_KEY,
        model: overrides?.zhipuTextModel || process.env.ZHIPU_TEXT_MODEL || "glm-5",
        temperature,
        ...(maxTokens != null ? { maxTokens } : {}),
        configuration: {
          baseURL: zhipuBaseURL,
        },
      });
    }
    default:
      throw new Error(`Unsupported text provider: ${provider}`);
  }
}
