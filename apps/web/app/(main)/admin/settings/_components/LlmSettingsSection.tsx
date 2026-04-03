"use client";

import { useState } from "react";
import { adminApi, LLM_PROVIDERS, type LlmProvider } from "@/lib/api";
import { useSettingsForm } from "@/lib/hooks/use-settings-form";
import { useFormatters, useT } from "@/lib/i18n";
import {
  buildLlmProviderPayload,
  EMPTY_PROVIDER_FORM,
  LlmProviderFields,
  type LlmProviderFormValues,
} from "../../_components/LlmProviderFields";
import { INPUT_CLASS, SettingsSaveButton, SettingsSectionShell } from "./SettingsSectionShell";
import type { TestModalState } from "./TestConnectionModal";
import { useConnectionTest } from "./use-connection-test";

interface LlmSettingsSectionProps {
  onTestModal: (modal: TestModalState | null) => void;
}

interface LlmSettingsForm extends LlmProviderFormValues {
  provider: LlmProvider;
}

const emptyForm: LlmSettingsForm = {
  provider: "google",
  ...EMPTY_PROVIDER_FORM,
};

export function LlmSettingsSection({ onTestModal }: LlmSettingsSectionProps) {
  const t = useT();
  const formatters = useFormatters();

  const [form, setForm] = useState<LlmSettingsForm>(emptyForm);
  const { loading, saving, error, notice, loadSettings, handleSave, setError, setNotice } =
    useSettingsForm({
      load: () => adminApi.getLlmSettings(),
      onLoaded: (data) => {
        setForm({
          provider: data.provider,
          geminiApiKey: data.geminiApiKey ?? "",
          geminiTextModel: data.geminiTextModel ?? "",
          vertexProject: data.vertexProject ?? "",
          vertexLocation: data.vertexLocation ?? "",
          vertexModel: data.vertexModel ?? "",
          zhipuApiKey: data.zhipuApiKey ?? "",
          zhipuTextModel: data.zhipuTextModel ?? "",
          zhipuUseCodingPlan: data.zhipuUseCodingPlan ?? false,
          openaiCompatBaseUrl: data.openaiCompatBaseUrl ?? "",
          openaiCompatApiKey: data.openaiCompatApiKey ?? "",
          openaiCompatModel: data.openaiCompatModel ?? "",
        });
      },
      save: async () => {
        await adminApi.updateLlmSettings({
          provider: form.provider,
          ...buildLlmProviderPayload(form),
        });
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
            value={form.provider}
            onChange={(e) => setForm((c) => ({ ...c, provider: e.target.value as LlmProvider }))}
            className={`${INPUT_CLASS} cursor-pointer`}
          >
            {LLM_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {formatters.provider(p)}
              </option>
            ))}
          </select>
        </label>

        <LlmProviderFields
          provider={form.provider}
          values={form}
          onChange={(updates) => setForm((c) => ({ ...c, ...updates }))}
        />

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
