"use client";

import type { LlmProvider } from "@/lib/api";
import { useT } from "@/lib/i18n";

const INPUT_CLASS = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2";

export interface LlmProviderFormValues {
  geminiApiKey: string;
  geminiTextModel: string;
  vertexProject: string;
  vertexLocation: string;
  vertexModel: string;
  zhipuApiKey: string;
  zhipuTextModel: string;
  zhipuUseCodingPlan: boolean;
  openaiCompatBaseUrl: string;
  openaiCompatApiKey: string;
  openaiCompatModel: string;
}

export const EMPTY_PROVIDER_FORM: LlmProviderFormValues = {
  geminiApiKey: "",
  geminiTextModel: "",
  vertexProject: "",
  vertexLocation: "",
  vertexModel: "",
  zhipuApiKey: "",
  zhipuTextModel: "",
  zhipuUseCodingPlan: false,
  openaiCompatBaseUrl: "",
  openaiCompatApiKey: "",
  openaiCompatModel: "",
};

const MASKED_VALUE = "••••••••";

const SECRET_KEYS = ["geminiApiKey", "zhipuApiKey", "openaiCompatApiKey"] as const;

/**
 * Build a payload object from form values, skipping masked secrets and
 * converting empty strings to null for optional fields.
 */
export function buildLlmProviderPayload(values: LlmProviderFormValues): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const key of SECRET_KEYS) {
    const v = values[key];
    if (v && v !== MASKED_VALUE) payload[key] = v;
  }

  payload.geminiTextModel = values.geminiTextModel || null;
  payload.vertexProject = values.vertexProject || null;
  payload.vertexLocation = values.vertexLocation || null;
  payload.vertexModel = values.vertexModel || null;
  payload.zhipuTextModel = values.zhipuTextModel || null;
  payload.zhipuUseCodingPlan = values.zhipuUseCodingPlan;
  payload.openaiCompatBaseUrl = values.openaiCompatBaseUrl || null;
  payload.openaiCompatModel = values.openaiCompatModel || null;

  return payload;
}

interface LlmProviderFieldsProps {
  provider: LlmProvider;
  values: LlmProviderFormValues;
  onChange: (updates: Partial<LlmProviderFormValues>) => void;
}

export function LlmProviderFields({ provider, values, onChange }: LlmProviderFieldsProps) {
  const t = useT();

  if (provider === "google") {
    return (
      <>
        <label className="block text-sm text-gray-700">
          {t("admin.settings.llmGeminiApiKey")}
          <input
            type="password"
            value={values.geminiApiKey}
            onChange={(e) => onChange({ geminiApiKey: e.target.value })}
            placeholder="AIza..."
            autoComplete="off"
            className={INPUT_CLASS}
          />
        </label>
        <label className="block text-sm text-gray-700">
          {t("admin.settings.llmGeminiModel")}
          <input
            value={values.geminiTextModel}
            onChange={(e) => onChange({ geminiTextModel: e.target.value })}
            placeholder="gemini-1.5-flash"
            className={INPUT_CLASS}
          />
        </label>
      </>
    );
  }

  if (provider === "vertex") {
    return (
      <>
        <label className="block text-sm text-gray-700">
          {t("admin.settings.llmVertexProject")}
          <input
            value={values.vertexProject}
            onChange={(e) => onChange({ vertexProject: e.target.value })}
            placeholder="my-gcp-project"
            className={INPUT_CLASS}
          />
        </label>
        <label className="block text-sm text-gray-700">
          {t("admin.settings.llmVertexLocation")}
          <input
            value={values.vertexLocation}
            onChange={(e) => onChange({ vertexLocation: e.target.value })}
            placeholder="asia-northeast1"
            className={INPUT_CLASS}
          />
        </label>
        <label className="block text-sm text-gray-700">
          {t("admin.settings.llmVertexModel")}
          <input
            value={values.vertexModel}
            onChange={(e) => onChange({ vertexModel: e.target.value })}
            placeholder="gemini-1.5-flash"
            className={INPUT_CLASS}
          />
        </label>
        <p className="text-xs text-gray-500">{t("admin.settings.llmVertexAdcHint")}</p>
      </>
    );
  }

  if (provider === "zhipu") {
    return (
      <>
        <label className="block text-sm text-gray-700">
          {t("admin.settings.llmZhipuApiKey")}
          <input
            type="password"
            value={values.zhipuApiKey}
            onChange={(e) => onChange({ zhipuApiKey: e.target.value })}
            autoComplete="off"
            className={INPUT_CLASS}
          />
        </label>
        <label className="block text-sm text-gray-700">
          {t("admin.settings.llmZhipuModel")}
          <input
            value={values.zhipuTextModel}
            onChange={(e) => onChange({ zhipuTextModel: e.target.value })}
            placeholder="glm-5"
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={values.zhipuUseCodingPlan}
            onChange={(e) => onChange({ zhipuUseCodingPlan: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          {t("admin.settings.llmZhipuCodingPlan")}
        </label>
      </>
    );
  }

  if (provider === "openai-compatible") {
    return (
      <>
        <label className="block text-sm text-gray-700">
          {t("admin.settings.llmOpenaiCompatBaseUrl")}
          <input
            value={values.openaiCompatBaseUrl}
            onChange={(e) => onChange({ openaiCompatBaseUrl: e.target.value })}
            placeholder="http://localhost:11434/v1"
            className={INPUT_CLASS}
          />
        </label>
        <label className="block text-sm text-gray-700">
          {t("admin.settings.llmOpenaiCompatApiKey")}
          <input
            type="password"
            value={values.openaiCompatApiKey}
            onChange={(e) => onChange({ openaiCompatApiKey: e.target.value })}
            autoComplete="off"
            placeholder={t("admin.settings.llmOpenaiCompatApiKeyPlaceholder")}
            className={INPUT_CLASS}
          />
        </label>
        <label className="block text-sm text-gray-700">
          {t("admin.settings.llmOpenaiCompatModel")}
          <input
            value={values.openaiCompatModel}
            onChange={(e) => onChange({ openaiCompatModel: e.target.value })}
            placeholder="llama3, qwen2.5, mistral..."
            className={INPUT_CLASS}
          />
        </label>
      </>
    );
  }

  return null;
}
