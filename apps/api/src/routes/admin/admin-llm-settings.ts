import { Hono } from "hono";
import type { LlmOverrides } from "../../ai/llm/index.js";
import {
  createChatModel,
  isTextGenerationEnabled,
  resolveTextProvider,
} from "../../ai/llm/index.js";
import { jsonError } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import type { LlmSettings } from "../../services/admin/admin-service.js";
import { getLlmSettings, updateLlmSettings } from "../../services/admin/admin-service.js";
import { createAdminSettingsRoutes } from "./create-settings-routes.js";
import { updateLlmSettingsSchema } from "./schemas.js";

const settingsRoutes = createAdminSettingsRoutes<LlmSettings>({
  path: "llm-settings",
  secretFields: ["geminiApiKey", "zhipuApiKey"],
  getSettings: getLlmSettings,
  updateSettings: updateLlmSettings,
  validationSchema: updateLlmSettingsSchema,
  errorPrefix: "ADMIN_LLM_SETTINGS",
  label: "LLM settings",
});

export const adminLlmSettingsRoutes = new Hono<AppEnv>();
adminLlmSettingsRoutes.route("/", settingsRoutes);

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
    const detail = error instanceof Error ? error.message : undefined;
    return jsonError(c, 502, "LLM_TEST_FAILED", "LLM connection test failed", detail);
  }
});
