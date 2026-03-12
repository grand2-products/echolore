"use client";

import { type AgentDefinition, type CreateAgentRequest, adminApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useFormatters, useT } from "@/lib/i18n";
import { useStableEvent } from "@/lib/use-stable-event";
import { useEffect, useState } from "react";

const emptyForm: CreateAgentRequest = {
  name: "",
  description: "",
  systemPrompt: "",
  voiceProfile: "",
  interventionStyle: "facilitator",
  defaultProvider: "google",
  isActive: true,
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
      } else {
        await adminApi.createAgent(form);
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
    <div className="p-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4">
            <h1 className="text-3xl font-bold text-gray-900">{t("admin.agents.title")}</h1>
            <p className="mt-1 text-sm text-gray-600">
              {t("admin.agents.description")}
            </p>
          </div>

          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
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
                    setEditingId(agent.id);
                    setForm({
                      name: agent.name,
                      description: agent.description,
                      systemPrompt: agent.systemPrompt,
                      voiceProfile: agent.voiceProfile,
                      interventionStyle: agent.interventionStyle,
                      defaultProvider: "google",
                      isActive: agent.isActive,
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
    </div>
  );
}
