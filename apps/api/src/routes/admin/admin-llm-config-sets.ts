import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  createChatModel,
  isTextGenerationEnabled,
  mapToOverrides,
  resolveTextProvider,
} from "../../ai/llm/index.js";
import { jsonError, withErrorHandler } from "../../lib/api-error.js";
import type { AppEnv } from "../../lib/auth.js";
import { maskSecrets, stripMaskedValues } from "../../lib/secret-mask.js";
import {
  createLlmConfigSet,
  deleteLlmConfigSet,
  getConfigSetAssignments,
  getConfigSetById,
  LLM_SECRET_FIELDS,
  listConfigSets,
  updateConfigSetAssignments,
  updateLlmConfigSet,
} from "../../services/admin/admin-service.js";
import {
  createLlmConfigSetSchema,
  updateConfigSetAssignmentsSchema,
  updateLlmConfigSetSchema,
} from "./schemas.js";

export const adminLlmConfigSetRoutes = new Hono<AppEnv>();

// --- Static routes first (before :id param routes) ---

// List all config sets
adminLlmConfigSetRoutes.get(
  "/llm-config-sets",
  withErrorHandler("LLM_CONFIG_SETS_FETCH_FAILED", "Failed to fetch LLM config sets"),
  async (c) => {
    const configSets = await listConfigSets();
    return c.json({
      configSets: configSets.map((cs) => maskSecrets(cs, [...LLM_SECRET_FIELDS])),
    });
  }
);

// Create config set
adminLlmConfigSetRoutes.post(
  "/llm-config-sets",
  zValidator("json", createLlmConfigSetSchema),
  withErrorHandler("LLM_CONFIG_SET_CREATE_FAILED", "Failed to create LLM config set"),
  async (c) => {
    const data = c.req.valid("json");
    const id = `llmcs_${crypto.randomUUID().slice(0, 12)}`;
    const configSet = await createLlmConfigSet({ ...data, id });
    if (!configSet) {
      return jsonError(c, 500, "LLM_CONFIG_SET_CREATE_FAILED", "Failed to create config set");
    }
    return c.json({ configSet: maskSecrets(configSet, [...LLM_SECRET_FIELDS]) }, 201);
  }
);

// Get feature-to-config-set assignments
adminLlmConfigSetRoutes.get(
  "/llm-config-sets/assignments",
  withErrorHandler("LLM_ASSIGNMENTS_FETCH_FAILED", "Failed to fetch assignments"),
  async (c) => {
    return c.json(await getConfigSetAssignments());
  }
);

// Update feature-to-config-set assignments
adminLlmConfigSetRoutes.put(
  "/llm-config-sets/assignments",
  zValidator("json", updateConfigSetAssignmentsSchema),
  withErrorHandler("LLM_ASSIGNMENTS_UPDATE_FAILED", "Failed to update assignments"),
  async (c) => {
    const data = c.req.valid("json");
    const assignments = await updateConfigSetAssignments(data);
    return c.json(assignments);
  }
);

// --- Parameterized routes ---

// Update config set
adminLlmConfigSetRoutes.put(
  "/llm-config-sets/:id",
  zValidator("json", updateLlmConfigSetSchema),
  withErrorHandler("LLM_CONFIG_SET_UPDATE_FAILED", "Failed to update LLM config set"),
  async (c) => {
    const { id } = c.req.param();
    const data = stripMaskedValues(c.req.valid("json"), [...LLM_SECRET_FIELDS]);
    const configSet = await updateLlmConfigSet(id, data);
    if (!configSet) {
      return jsonError(c, 404, "LLM_CONFIG_SET_NOT_FOUND", "Config set not found");
    }
    return c.json({ configSet: maskSecrets(configSet, [...LLM_SECRET_FIELDS]) });
  }
);

// Delete config set
adminLlmConfigSetRoutes.delete(
  "/llm-config-sets/:id",
  withErrorHandler("LLM_CONFIG_SET_DELETE_FAILED", "Failed to delete LLM config set"),
  async (c) => {
    const { id } = c.req.param();
    const result = await deleteLlmConfigSet(id);
    if (!result.ok) {
      return jsonError(c, 409, "LLM_CONFIG_SET_IN_USE", result.reason ?? "Config set is in use");
    }
    return c.json({ ok: true });
  }
);

// Test connection for a specific config set
adminLlmConfigSetRoutes.post(
  "/llm-config-sets/:id/test",
  withErrorHandler("LLM_CONFIG_SET_TEST_FAILED", "LLM connection test failed"),
  async (c) => {
    const { id } = c.req.param();
    const configSet = await getConfigSetById(id);
    if (!configSet) {
      return jsonError(c, 404, "LLM_CONFIG_SET_NOT_FOUND", "Config set not found");
    }

    const provider = resolveTextProvider(configSet.provider);
    const overrides = mapToOverrides(configSet);

    if (!isTextGenerationEnabled(provider, overrides)) {
      return c.json(
        { ok: false, error: "API key is not configured for the selected provider." },
        400
      );
    }

    try {
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
  }
);
