"use client";

import { useState } from "react";
import { adminApi, type LlmProvider } from "@/lib/api";
import { useSettingsForm } from "@/lib/hooks/use-settings-form";
import { useT } from "@/lib/i18n";
import { INPUT_CLASS, SettingsSaveButton, SettingsSectionShell } from "./SettingsSectionShell";
import type { TestModalState } from "./TestConnectionModal";
import { useConnectionTest } from "./use-connection-test";

interface LlmSettingsSectionProps {
  onTestModal: (modal: TestModalState | null) => void;
}

export function LlmSettingsSection({ onTestModal }: LlmSettingsSectionProps) {
  const t = useT();

  const [llmProvider, setLlmProvider] = useState<LlmProvider>("google");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiTextModel, setGeminiTextModel] = useState("");
  const [vertexProject, setVertexProject] = useState("");
  const [vertexLocation, setVertexLocation] = useState("");
  const [vertexModel, setVertexModel] = useState("");
  const [zhipuApiKey, setZhipuApiKey] = useState("");
  const [zhipuTextModel, setZhipuTextModel] = useState("");
  const [zhipuUseCodingPlan, setZhipuUseCodingPlan] = useState(false);
  const { loading, saving, error, notice, loadSettings, handleSave, setError, setNotice } =
    useSettingsForm({
      load: () => adminApi.getLlmSettings(),
      onLoaded: (data) => {
        setLlmProvider(data.provider);
        setGeminiApiKey(data.geminiApiKey ?? "");
        setGeminiTextModel(data.geminiTextModel ?? "");
        setVertexProject(data.vertexProject ?? "");
        setVertexLocation(data.vertexLocation ?? "");
        setVertexModel(data.vertexModel ?? "");
        setZhipuApiKey(data.zhipuApiKey ?? "");
        setZhipuTextModel(data.zhipuTextModel ?? "");
        setZhipuUseCodingPlan(data.zhipuUseCodingPlan ?? false);
      },
      save: async () => {
        const payload: Record<string, unknown> = { provider: llmProvider };
        if (geminiApiKey && geminiApiKey !== "••••••••") payload.geminiApiKey = geminiApiKey;
        payload.geminiTextModel = geminiTextModel || null;
        payload.vertexProject = vertexProject || null;
        payload.vertexLocation = vertexLocation || null;
        payload.vertexModel = vertexModel || null;
        if (zhipuApiKey && zhipuApiKey !== "••••••••") payload.zhipuApiKey = zhipuApiKey;
        payload.zhipuTextModel = zhipuTextModel || null;
        payload.zhipuUseCodingPlan = zhipuUseCodingPlan;
        await adminApi.updateLlmSettings(payload);
      },
    });

  const { testing: llmTesting, handleTest: handleLlmTest } = useConnectionTest({
    title: t("admin.settings.llmTestTitle"),
    test: async () => {
      const result = await adminApi.testLlmConnection();
      return {
        ok: result.ok,
        message: result.reply
          ? `${t("admin.settings.llmTestSuccess")}\n\n${t("admin.settings.llmTestReply")}: ${result.reply}`
          : t("admin.settings.llmTestSuccess"),
        error: result.error,
      };
    },
    setError,
    setNotice,
    onTestModal,
    testingMessage: t("admin.settings.testing"),
    failMessage: t("admin.settings.llmTestFail"),
  });

  return (
    <SettingsSectionShell
      title={t("admin.settings.llmTitle")}
      description={t("admin.settings.llmDescription")}
      error={error}
      notice={notice}
      loading={loading}
      onRetry={() => void loadSettings()}
    >
      <div className="space-y-4">
        <label className="block text-sm text-gray-700">
          {t("admin.settings.llmProvider")}
          <select
            value={llmProvider}
            onChange={(e) => setLlmProvider(e.target.value as LlmProvider)}
            className={`${INPUT_CLASS} cursor-pointer`}
          >
            <option value="google">{t("common.providerGoogle")}</option>
            <option value="vertex">{t("common.providerVertex")}</option>
            <option value="zhipu">{t("common.providerZhipu")}</option>
          </select>
        </label>

        {llmProvider === "google" && (
          <>
            <label className="block text-sm text-gray-700">
              {t("admin.settings.llmGeminiApiKey")}
              <input
                type="password"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="AIza..."
                autoComplete="off"
                className={INPUT_CLASS}
              />
            </label>
            <label className="block text-sm text-gray-700">
              {t("admin.settings.llmGeminiModel")}
              <input
                value={geminiTextModel}
                onChange={(e) => setGeminiTextModel(e.target.value)}
                placeholder="gemini-1.5-flash"
                className={INPUT_CLASS}
              />
            </label>
          </>
        )}

        {llmProvider === "vertex" && (
          <>
            <label className="block text-sm text-gray-700">
              {t("admin.settings.llmVertexProject")}
              <input
                value={vertexProject}
                onChange={(e) => setVertexProject(e.target.value)}
                placeholder="my-gcp-project"
                className={INPUT_CLASS}
              />
            </label>
            <label className="block text-sm text-gray-700">
              {t("admin.settings.llmVertexLocation")}
              <input
                value={vertexLocation}
                onChange={(e) => setVertexLocation(e.target.value)}
                placeholder="asia-northeast1"
                className={INPUT_CLASS}
              />
            </label>
            <label className="block text-sm text-gray-700">
              {t("admin.settings.llmVertexModel")}
              <input
                value={vertexModel}
                onChange={(e) => setVertexModel(e.target.value)}
                placeholder="gemini-1.5-flash"
                className={INPUT_CLASS}
              />
            </label>
            <p className="text-xs text-gray-500">{t("admin.settings.llmVertexAdcHint")}</p>
          </>
        )}

        {llmProvider === "zhipu" && (
          <>
            <label className="block text-sm text-gray-700">
              {t("admin.settings.llmZhipuApiKey")}
              <input
                type="password"
                value={zhipuApiKey}
                onChange={(e) => setZhipuApiKey(e.target.value)}
                autoComplete="off"
                className={INPUT_CLASS}
              />
            </label>
            <label className="block text-sm text-gray-700">
              {t("admin.settings.llmZhipuModel")}
              <input
                value={zhipuTextModel}
                onChange={(e) => setZhipuTextModel(e.target.value)}
                placeholder="glm-5"
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={zhipuUseCodingPlan}
                onChange={(e) => setZhipuUseCodingPlan(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              {t("admin.settings.llmZhipuCodingPlan")}
            </label>
          </>
        )}

        <div className="flex gap-3">
          <SettingsSaveButton
            saving={saving}
            onClick={() => void handleSave()}
            widthClass="flex-1"
          />
          <button
            type="button"
            onClick={() => void handleLlmTest()}
            disabled={llmTesting || saving}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {llmTesting ? t("admin.settings.llmTesting") : t("admin.settings.llmTest")}
          </button>
        </div>
      </div>
    </SettingsSectionShell>
  );
}
