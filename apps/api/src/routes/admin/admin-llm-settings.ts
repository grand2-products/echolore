import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { LlmOverrides } from "../../ai/llm/index.js";
import {
  createChatModel,
  isTextGenerationEnabled,
  resolveTextProvider,
} from "../../ai/llm/index.js";
import { withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { maskSecrets, stripMaskedValues } from "../../lib/secret-mask.js";
import { getLlmSettings, updateLlmSettings } from "../../services/admin/admin-service.js";
import { updateLlmSettingsSchema } from "./schemas.js";

const SECRET_FIELDS = ["geminiApiKey", "zhipuApiKey"] as const;

export const adminLlmSettingsRoutes = new Hono<AppEnv>();

adminLlmSettingsRoutes.get(
  "/llm-settings",
  withErrorHandler("ADMIN_LLM_SETTINGS_FETCH_FAILED", "Failed to fetch LLM settings"),
  async (c) => {
    const settings = await getLlmSettings();
    return c.json(maskSecrets(settings, [...SECRET_FIELDS]));
  }
);

adminLlmSettingsRoutes.put(
  "/llm-settings",
  zValidator("json", updateLlmSettingsSchema),
  withErrorHandler("ADMIN_LLM_SETTINGS_UPDATE_FAILED", "Failed to update LLM settings"),
  async (c) => {
    const data = stripMaskedValues(c.req.valid("json"), [...SECRET_FIELDS]);
    const updated = await updateLlmSettings(data);
    return c.json(maskSecrets(updated, [...SECRET_FIELDS]));
  }
);

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
      return c.json(
        { ok: false, error: "API key is not configured for the selected provider." },
        400
      );
    }

    const model = createChatModel({ provider, temperature: 0, overrides });
    const { HumanMessage } = await import("@langchain/core/messages");
    const response = await model.invoke([new HumanMessage("Reply with exactly: OK")]);
    const text =
      typeof response.content === "string"
        ? response.content.trim()
        : String(response.content).trim();

    return c.json({ ok: true, reply: text });
  } catch (error) {
    console.error("LLM test failed:", error);
    const detail = error instanceof Error ? error.message : "Unknown error";
    return c.json({ ok: false, error: `LLM connection test failed: ${detail}` }, 502);
  }
});
