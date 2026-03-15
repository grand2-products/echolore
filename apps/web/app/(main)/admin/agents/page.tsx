"use client";

import { type AgentDefinition, type CreateAgentRequest, adminApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useFormatters, useT } from "@/lib/i18n";
import { useStableEvent } from "@/lib/hooks/use-stable-event";
import { useEffect, useState } from "react";
import { LlmSettingsSection } from "../settings/_components/LlmSettingsSection";
import { TestConnectionModal, type TestModalState } from "../settings/_components/TestConnectionModal";

const emptyForm: CreateAgentRequest = {
  name: "",
  description: "",
  systemPrompt: "",
  voiceProfile: "",
  interventionStyle: "facilitator",
  defaultProvider: "google",
  isActive: true,
  autonomousEnabled: false,
  autonomousCooldownSec: 120,
};

export default function AdminAgentsPage() {
  const t = useT();
  const formatters = useFormatters();
  const getApiErrorMessage = useApiErrorMessage();
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [form, setForm] = useState<CreateAgentRequest>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testModal, setTestModal] = useState<TestModalState | null>(null);

  const loadAgents = useStableEvent(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await adminApi.listAgents();
      setAgents(response.agents);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, t("admin.agents.loadError")));
    } finally {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const submit = async () => {
    setIsSaving(true);
    setError(null);
    try {
      if (editingId) {
        await adminApi.updateAgent(editingId, form);
        setNotice(t("admin.agents.updated"));
      } else {
        await adminApi.createAgent(form);
        setNotice(t("admin.agents.created"));
      }
      setForm(emptyForm);
      setEditingId(null);
      await loadAgents();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, t("admin.agents.saveError")));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <LlmSettingsSection onTestModal={setTestModal} />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-gray-200 bg-white p-6">

          {error ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => void loadAgents()}
                className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                {t("common.actions.retry")}
              </button>
            </div>
          ) : null}
          {notice ? (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {notice}
            </div>
          ) : null}

          {isLoading ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
              {t("admin.agents.loading")}
            </div>
          ) : (
            <div className="space-y-3">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => {
                    setNotice(null);
                    setEditingId(agent.id);
                    setForm({
                      name: agent.name,
                      description: agent.description,
                      systemPrompt: agent.systemPrompt,
                      voiceProfile: agent.voiceProfile,
                      interventionStyle: agent.interventionStyle,
                      defaultProvider: (["google", "vertex", "zhipu"].includes(agent.defaultProvider) ? agent.defaultProvider : "google") as CreateAgentRequest["defaultProvider"],
                      isActive: agent.isActive,
                      autonomousEnabled: agent.autonomousEnabled,
                      autonomousCooldownSec: agent.autonomousCooldownSec,
                    });
                  }}
                  className="w-full rounded-lg border border-gray-200 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">{agent.name}</div>
                      <div className="mt-1 text-sm text-gray-600">
                        {agent.description || t("admin.agents.noDescription")}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {agent.autonomousEnabled ? (
                        <span className="rounded-full bg-purple-100 px-2 py-1 text-xs text-purple-700">
                          {t("admin.agents.autonomous")}
                        </span>
                      ) : null}
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          agent.isActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {agent.isActive ? t("admin.agents.active") : t("admin.agents.inactive")}
                      </span>
                    </div>
                  </div>
                    <div className="mt-3 text-xs text-gray-500">
                      {t("admin.agents.meta", {
                      style: formatters.interventionStyle(agent.interventionStyle),
                      provider: formatters.provider(agent.defaultProvider),
                    })}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              {editingId ? t("admin.agents.edit") : t("admin.agents.create")}
            </h2>
            {editingId ? (
              <button
                type="button"
                onClick={() => {
                  setNotice(null);
                  setEditingId(null);
                  setForm(emptyForm);
                }}
                className="text-sm text-gray-500 hover:text-gray-800"
              >
                {t("admin.agents.reset")}
              </button>
            ) : null}
          </div>

          <div className="space-y-4">
            <label className="block text-sm text-gray-700">
              {t("admin.agents.name")}
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="block text-sm text-gray-700">
              {t("admin.agents.descriptionLabel")}
              <input
                value={form.description ?? ""}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="block text-sm text-gray-700">
              {t("admin.agents.interventionStyle")}
              <input
                value={form.interventionStyle}
                onChange={(event) =>
                  setForm((current) => ({ ...current, interventionStyle: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="block text-sm text-gray-700">
              {t("admin.agents.voiceProfile")}
              <input
                value={form.voiceProfile ?? ""}
                onChange={(event) =>
                  setForm((current) => ({ ...current, voiceProfile: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="block text-sm text-gray-700">
              {t("admin.agents.providerLabel")}
              <select
                value={form.defaultProvider}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    defaultProvider: event.target.value as CreateAgentRequest["defaultProvider"],
                  }))
                }
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              >
                <option value="google">{formatters.provider("google")}</option>
                <option value="vertex">{formatters.provider("vertex")}</option>
                <option value="zhipu">{formatters.provider("zhipu")}</option>
              </select>
            </label>

            <label className="block text-sm text-gray-700">
              {t("admin.agents.systemPrompt")}
              <textarea
                value={form.systemPrompt}
                onChange={(event) =>
                  setForm((current) => ({ ...current, systemPrompt: event.target.value }))
                }
                rows={10}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.isActive ?? true}
                onChange={(event) =>
                  setForm((current) => ({ ...current, isActive: event.target.checked }))
                }
              />
              {t("admin.agents.activeLabel")}
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.autonomousEnabled ?? false}
                onChange={(event) =>
                  setForm((current) => ({ ...current, autonomousEnabled: event.target.checked }))
                }
              />
              {t("admin.agents.autonomousEnabled")}
            </label>

            {form.autonomousEnabled ? (
              <label className="block text-sm text-gray-700">
                {t("admin.agents.autonomousCooldown")}
                <input
                  type="number"
                  min={10}
                  max={3600}
                  value={form.autonomousCooldownSec ?? 120}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      autonomousCooldownSec: Number(event.target.value) || 120,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
                />
              </label>
            ) : null}

            <button
              type="button"
              onClick={submit}
              disabled={isSaving || !form.name.trim() || !form.systemPrompt.trim()}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {isSaving
                ? t("admin.agents.saving")
                : editingId
                  ? t("admin.agents.updateAction")
                  : t("admin.agents.createAction")}
            </button>
          </div>
        </section>
      </div>

      {testModal && (
        <TestConnectionModal modal={testModal} onClose={() => setTestModal(null)} />
      )}
    </div>
  );
}
