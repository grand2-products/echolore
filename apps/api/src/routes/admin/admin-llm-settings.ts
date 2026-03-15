import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { createChatModel, isTextGenerationEnabled, resolveTextProvider } from "../../ai/llm/index.js";
import type { LlmOverrides } from "../../ai/llm/index.js";
import { withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import {
  getLlmSettings,
  updateLlmSettings,
} from "../../services/admin/admin-service.js";
import { updateLlmSettingsSchema } from "./schemas.js";

export const adminLlmSettingsRoutes = new Hono<AppEnv>();

adminLlmSettingsRoutes.get("/llm-settings", withErrorHandler(async (c) => {
  const settings = await getLlmSettings();
  return c.json({
    ...settings,
    geminiApiKey: settings.geminiApiKey ? "••••••••" : null,
    zhipuApiKey: settings.zhipuApiKey ? "••••••••" : null,
    embeddingEnabled: settings.embeddingEnabled,
    embeddingModel: settings.embeddingModel,
  });
}, "ADMIN_LLM_SETTINGS_FETCH_FAILED", "Failed to fetch LLM settings"));

adminLlmSettingsRoutes.put("/llm-settings", zValidator("json", updateLlmSettingsSchema), withErrorHandler(async (c) => {
  const data = c.req.valid("json");
  // Strip masked placeholder values so we don't overwrite real secrets
  if (data.geminiApiKey === "••••••••") delete data.geminiApiKey;
  if (data.zhipuApiKey === "••••••••") delete data.zhipuApiKey;
  const updated = await updateLlmSettings(data);
  return c.json({
    ...updated,
    geminiApiKey: updated.geminiApiKey ? "••••••••" : null,
    zhipuApiKey: updated.zhipuApiKey ? "••••••••" : null,
  });
}, "ADMIN_LLM_SETTINGS_UPDATE_FAILED", "Failed to update LLM settings"));

adminLlmSettingsRoutes.post("/llm-settings/test", async (c) => {
  try {
    const settings = await getLlmSettings();
    const provider = resolveTextProvider(settings.provider);
    const overrides: LlmOverrides = {
      geminiApiKey: settings.geminiApiKey,
      geminiTextModel: settings.geminiTextModel,
      vertexProject: settings.vertexProject,
      vertexLocation: settings.vertexLocation,
      vertexModel: settings.vertexModel,
      zhipuApiKey: settings.zhipuApiKey,
      zhipuTextModel: settings.zhipuTextModel,
      zhipuUseCodingPlan: settings.zhipuUseCodingPlan,
    };

    if (!isTextGenerationEnabled(provider, overrides)) {
      return c.json({ ok: false, error: "API key is not configured for the selected provider." }, 400);
    }

    const model = createChatModel({ provider, temperature: 0, overrides });
    const { HumanMessage } = await import("@langchain/core/messages");
    const response = await model.invoke([new HumanMessage("Reply with exactly: OK")]);
    const text = typeof response.content === "string" ? response.content.trim() : String(response.content).trim();

    return c.json({ ok: true, reply: text });
  } catch (error) {
    console.error("LLM test failed:", error);
    const detail = error instanceof Error ? error.message : "Unknown error";
    return c.json({ ok: false, error: `LLM connection test failed: ${detail}` }, 502);
  }
});
