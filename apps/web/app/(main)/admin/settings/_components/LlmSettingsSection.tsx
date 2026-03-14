"use client";

import { adminApi, type LlmProvider } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import { useStableEvent } from "@/lib/use-stable-event";
import { useEffect, useState } from "react";
import { type TestModalState } from "./TestConnectionModal";

const INPUT_CLASS = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2";

interface LlmSettingsSectionProps {
  onTestModal: (modal: TestModalState | null) => void;
}

export function LlmSettingsSection({ onTestModal }: LlmSettingsSectionProps) {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();

  const [llmProvider, setLlmProvider] = useState<LlmProvider>("google");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiTextModel, setGeminiTextModel] = useState("");
  const [vertexProject, setVertexProject] = useState("");
  const [vertexLocation, setVertexLocation] = useState("");
  const [vertexModel, setVertexModel] = useState("");
  const [zhipuApiKey, setZhipuApiKey] = useState("");
  const [zhipuTextModel, setZhipuTextModel] = useState("");
  const [zhipuUseCodingPlan, setZhipuUseCodingPlan] = useState(false);
  const [llmLoading, setLlmLoading] = useState(true);
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmError, setLlmError] = useState<string | null>(null);
  const [llmNotice, setLlmNotice] = useState<string | null>(null);

  const loadLlmSettings = useStableEvent(async () => {
    setLlmLoading(true);
    setLlmError(null);
    try {
      const data = await adminApi.getLlmSettings();
      setLlmProvider(data.provider);
      setGeminiApiKey(data.geminiApiKey ?? "");
      setGeminiTextModel(data.geminiTextModel ?? "");
      setVertexProject(data.vertexProject ?? "");
      setVertexLocation(data.vertexLocation ?? "");
      setVertexModel(data.vertexModel ?? "");
      setZhipuApiKey(data.zhipuApiKey ?? "");
      setZhipuTextModel(data.zhipuTextModel ?? "");
      setZhipuUseCodingPlan(data.zhipuUseCodingPlan ?? false);
    } catch (loadError) {
      setLlmError(getApiErrorMessage(loadError, t("admin.settings.loadError")));
    } finally {
      setLlmLoading(false);
    }
  });

  useEffect(() => {
    void loadLlmSettings();
  }, [loadLlmSettings]);

  const handleLlmSave = async () => {
    setLlmSaving(true);
    setLlmError(null);
    setLlmNotice(null);
    try {
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
      setLlmNotice(t("admin.settings.updated"));
    } catch (saveError) {
      setLlmError(getApiErrorMessage(saveError, t("admin.settings.saveError")));
    } finally {
      setLlmSaving(false);
    }
  };

  const handleLlmTest = async () => {
    setLlmTesting(true);
    setLlmError(null);
    setLlmNotice(null);
    onTestModal({ title: t("admin.settings.llmTestTitle"), status: "loading", message: t("admin.settings.testing") });
    try {
      const result = await adminApi.testLlmConnection();
      if (result.ok) {
        onTestModal({
          title: t("admin.settings.llmTestTitle"),
          status: "success",
          message: result.reply ? `${t("admin.settings.llmTestSuccess")}\n\n${t("admin.settings.llmTestReply")}: ${result.reply}` : t("admin.settings.llmTestSuccess"),
        });
      } else {
        onTestModal({
          title: t("admin.settings.llmTestTitle"),
          status: "error",
          message: result.error ?? t("admin.settings.llmTestFail"),
        });
      }
    } catch (testError) {
      onTestModal({
        title: t("admin.settings.llmTestTitle"),
        status: "error",
        message: getApiErrorMessage(testError, t("admin.settings.llmTestFail")),
      });
    } finally {
      setLlmTesting(false);
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">{t("admin.settings.llmTitle")}</h2>
      <p className="mb-4 text-sm text-gray-500">{t("admin.settings.llmDescription")}</p>

      {llmError ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span>{llmError}</span>
          <button type="button" onClick={() => void loadLlmSettings()} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
            {t("common.actions.retry")}
          </button>
        </div>
      ) : null}
      {llmNotice ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{llmNotice}</div>
      ) : null}

      {llmLoading ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">{t("admin.settings.loading")}</div>
      ) : (
        <div className="space-y-4">
          <label className="block text-sm text-gray-700">
            {t("admin.settings.llmProvider")}
            <select value={llmProvider} onChange={(e) => setLlmProvider(e.target.value as LlmProvider)} className={`${INPUT_CLASS} cursor-pointer`}>
              <option value="google">{t("common.providerGoogle")}</option>
              <option value="vertex">{t("common.providerVertex")}</option>
              <option value="zhipu">{t("common.providerZhipu")}</option>
            </select>
          </label>

          {llmProvider === "google" && (
            <>
              <label className="block text-sm text-gray-700">
                {t("admin.settings.llmGeminiApiKey")}
                <input type="password" value={geminiApiKey} onChange={(e) => setGeminiApiKey(e.target.value)} placeholder="AIza..." className={INPUT_CLASS} />
              </label>
              <label className="block text-sm text-gray-700">
                {t("admin.settings.llmGeminiModel")}
                <input value={geminiTextModel} onChange={(e) => setGeminiTextModel(e.target.value)} placeholder="gemini-1.5-flash" className={INPUT_CLASS} />
              </label>
            </>
          )}

          {llmProvider === "vertex" && (
            <>
              <label className="block text-sm text-gray-700">
                {t("admin.settings.llmVertexProject")}
                <input value={vertexProject} onChange={(e) => setVertexProject(e.target.value)} placeholder="my-gcp-project" className={INPUT_CLASS} />
              </label>
              <label className="block text-sm text-gray-700">
                {t("admin.settings.llmVertexLocation")}
                <input value={vertexLocation} onChange={(e) => setVertexLocation(e.target.value)} placeholder="asia-northeast1" className={INPUT_CLASS} />
              </label>
              <label className="block text-sm text-gray-700">
                {t("admin.settings.llmVertexModel")}
                <input value={vertexModel} onChange={(e) => setVertexModel(e.target.value)} placeholder="gemini-1.5-flash" className={INPUT_CLASS} />
              </label>
              <p className="text-xs text-gray-500">{t("admin.settings.llmVertexAdcHint")}</p>
            </>
          )}

          {llmProvider === "zhipu" && (
            <>
              <label className="block text-sm text-gray-700">
                {t("admin.settings.llmZhipuApiKey")}
                <input type="password" value={zhipuApiKey} onChange={(e) => setZhipuApiKey(e.target.value)} className={INPUT_CLASS} />
              </label>
              <label className="block text-sm text-gray-700">
                {t("admin.settings.llmZhipuModel")}
                <input value={zhipuTextModel} onChange={(e) => setZhipuTextModel(e.target.value)} placeholder="glm-5" className={INPUT_CLASS} />
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
            <button type="button" onClick={() => void handleLlmSave()} disabled={llmSaving} className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60">
              {llmSaving ? t("admin.settings.saving") : t("admin.settings.save")}
            </button>
            <button type="button" onClick={() => void handleLlmTest()} disabled={llmTesting || llmSaving} className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">
              {llmTesting ? t("admin.settings.llmTesting") : t("admin.settings.llmTest")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
