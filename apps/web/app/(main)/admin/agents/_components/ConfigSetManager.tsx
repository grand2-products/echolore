"use client";

import { useCallback, useEffect, useState } from "react";
import {
  adminApi,
  type ConfigSetAssignments,
  LLM_PROVIDERS,
  type LlmConfigSet,
  type LlmProvider,
} from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useFormatters, useT } from "@/lib/i18n";
import {
  buildLlmProviderPayload,
  EMPTY_PROVIDER_FORM,
  LlmProviderFields,
  type LlmProviderFormValues,
} from "../../_components/LlmProviderFields";
import type { TestModalState } from "../../settings/_components/TestConnectionModal";

const INPUT_CLASS = "mt-1 w-full rounded-md border border-gray-300 px-3 py-2";

interface ConfigSetManagerProps {
  onTestModal: (modal: TestModalState | null) => void;
  onConfigSetsChange?: (configSets: LlmConfigSet[]) => void;
}

interface ConfigSetForm extends LlmProviderFormValues {
  name: string;
  provider: LlmProvider;
}

const emptyForm: ConfigSetForm = {
  name: "",
  provider: "google",
  ...EMPTY_PROVIDER_FORM,
};

export function ConfigSetManager({ onTestModal, onConfigSetsChange }: ConfigSetManagerProps) {
  const t = useT();
  const formatters = useFormatters();
  const getApiErrorMessage = useApiErrorMessage();

  const [configSets, setConfigSets] = useState<LlmConfigSet[]>([]);
  const [assignments, setAssignments] = useState<ConfigSetAssignments>({
    aiChat: "default",
    aituber: "default",
    meetingAgent: "default",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState<ConfigSetForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [csRes, assignRes] = await Promise.all([
        adminApi.listLlmConfigSets(),
        adminApi.getConfigSetAssignments(),
      ]);
      setConfigSets(csRes.configSets);
      onConfigSetsChange?.(csRes.configSets);
      setAssignments(assignRes);
    } catch (err) {
      setError(getApiErrorMessage(err, t("admin.configSets.loadError")));
    } finally {
      setLoading(false);
    }
  }, [getApiErrorMessage, t, onConfigSetsChange]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const startEdit = (cs: LlmConfigSet) => {
    setEditingId(cs.id);
    setForm({
      name: cs.name,
      provider: cs.provider,
      geminiApiKey: cs.geminiApiKey ?? "",
      geminiTextModel: cs.geminiTextModel ?? "",
      vertexProject: cs.vertexProject ?? "",
      vertexLocation: cs.vertexLocation ?? "",
      vertexModel: cs.vertexModel ?? "",
      zhipuApiKey: cs.zhipuApiKey ?? "",
      zhipuTextModel: cs.zhipuTextModel ?? "",
      zhipuUseCodingPlan: cs.zhipuUseCodingPlan,
      openaiCompatBaseUrl: cs.openaiCompatBaseUrl ?? "",
      openaiCompatApiKey: cs.openaiCompatApiKey ?? "",
      openaiCompatModel: cs.openaiCompatModel ?? "",
    });
    setShowForm(true);
    setNotice(null);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        provider: form.provider,
        ...buildLlmProviderPayload(form),
      };

      if (editingId) {
        await adminApi.updateLlmConfigSet(editingId, payload);
        setNotice(t("admin.configSets.updated"));
      } else {
        await adminApi.createLlmConfigSet(payload as { name: string });
        setNotice(t("admin.configSets.created"));
      }
      resetForm();
      await loadData();
    } catch (err) {
      setError(getApiErrorMessage(err, t("admin.configSets.saveError")));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("admin.configSets.confirmDelete"))) return;
    try {
      await adminApi.deleteLlmConfigSet(id);
      setNotice(t("admin.configSets.deleted"));
      await loadData();
    } catch (err) {
      setError(getApiErrorMessage(err, t("admin.configSets.deleteError")));
    }
  };

  const handleTest = async (id: string) => {
    onTestModal({
      title: t("admin.settings.llmTestTitle"),
      status: "loading",
      message: t("admin.settings.testing"),
    });
    try {
      const result = await adminApi.testLlmConfigSet(id);
      onTestModal({
        title: t("admin.settings.llmTestTitle"),
        status: result.ok ? "success" : "error",
        message: result.ok
          ? `${t("admin.settings.llmTestSuccess")}\n\n${t("admin.settings.llmTestReply")}: ${result.reply}`
          : (result.error ?? t("admin.settings.llmTestFail")),
      });
    } catch (err) {
      onTestModal({
        title: t("admin.settings.llmTestTitle"),
        status: "error",
        message: getApiErrorMessage(err, t("admin.settings.llmTestFail")),
      });
    }
  };

  const handleAssignmentChange = async (
    feature: keyof ConfigSetAssignments,
    configSetId: string
  ) => {
    setError(null);
    try {
      const updated = await adminApi.updateConfigSetAssignments({
        [feature]: configSetId,
      });
      setAssignments(updated);
      setNotice(t("admin.configSets.assignmentUpdated"));
    } catch (err) {
      setError(getApiErrorMessage(err, t("admin.configSets.assignmentError")));
    }
  };

  const featureLabels: Record<keyof ConfigSetAssignments, string> = {
    aiChat: t("admin.configSets.featureAiChat"),
    aituber: t("admin.configSets.featureAituber"),
    meetingAgent: t("admin.configSets.featureMeetingAgent"),
  };

  return (
    <div className="space-y-6">
      {/* Config Set List */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{t("admin.configSets.title")}</h2>
            <p className="text-sm text-gray-500">{t("admin.configSets.description")}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            {t("admin.configSets.createAction")}
          </button>
        </div>

        {error && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void loadData()}
              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              {t("common.actions.retry")}
            </button>
          </div>
        )}
        {notice && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {notice}
          </div>
        )}

        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
            {t("admin.configSets.loading")}
          </div>
        ) : (
          <div className="space-y-3">
            {configSets.map((cs) => (
              <div
                key={cs.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
              >
                <div>
                  <div className="font-semibold text-gray-900">{cs.name}</div>
                  <div className="mt-1 text-sm text-gray-500">
                    {formatters.provider(cs.provider)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleTest(cs.id)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {t("admin.settings.llmTest")}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(cs)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {t("common.actions.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(cs.id)}
                    className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    {t("common.actions.delete")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Config Set Form (create/edit) */}
      {showForm && (
        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {editingId ? t("admin.configSets.edit") : t("admin.configSets.create")}
            </h2>
            <button
              type="button"
              onClick={resetForm}
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              {t("common.actions.cancel")}
            </button>
          </div>

          <div className="space-y-4">
            <label className="block text-sm text-gray-700">
              {t("admin.configSets.nameLabel")}
              <input
                value={form.name}
                onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                className={INPUT_CLASS}
              />
            </label>

            <label className="block text-sm text-gray-700">
              {t("admin.settings.llmProvider")}
              <select
                value={form.provider}
                onChange={(e) =>
                  setForm((c) => ({ ...c, provider: e.target.value as LlmProvider }))
                }
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

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !form.name.trim()}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {saving
                ? t("admin.settings.saving")
                : editingId
                  ? t("admin.configSets.updateAction")
                  : t("admin.configSets.createAction")}
            </button>
          </div>
        </section>
      )}

      {/* Feature Assignments */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">
          {t("admin.configSets.assignmentsTitle")}
        </h2>
        <p className="mb-4 text-sm text-gray-500">{t("admin.configSets.assignmentsDescription")}</p>

        <div className="space-y-3">
          {(Object.keys(featureLabels) as (keyof ConfigSetAssignments)[]).map((feature) => (
            <label key={feature} className="block text-sm text-gray-700">
              {featureLabels[feature]}
              <select
                value={assignments[feature]}
                onChange={(e) => void handleAssignmentChange(feature, e.target.value)}
                className={`${INPUT_CLASS} cursor-pointer`}
              >
                {configSets.map((cs) => (
                  <option key={cs.id} value={cs.id}>
                    {cs.name} ({formatters.provider(cs.provider)})
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
