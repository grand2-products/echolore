"use client";

import { useEffect, useState } from "react";
import { Tooltip } from "@/components/ui";
import { type AgentDefinition, adminApi, type CreateAgentRequest } from "@/lib/api";
import { aituberApi, type TtsVoice } from "@/lib/api/aituber";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useAsyncData } from "@/lib/hooks/use-async-data";
import { useFormatters, useT } from "@/lib/i18n";
import { LlmSettingsSection } from "../settings/_components/LlmSettingsSection";
import {
  TestConnectionModal,
  type TestModalState,
} from "../settings/_components/TestConnectionModal";

const VALID_PROVIDERS = ["google", "vertex", "zhipu", "openai-compatible"] as const;
const VALID_INTERVENTION_STYLES = ["facilitator", "observer", "active"] as const;

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
  const {
    data: agents,
    isLoading,
    error,
    refetch: loadAgents,
  } = useAsyncData<AgentDefinition[]>([], async () => {
    const response = await adminApi.listAgents();
    return response.agents;
  });
  const [form, setForm] = useState<CreateAgentRequest>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testModal, setTestModal] = useState<TestModalState | null>(null);
  const [voices, setVoices] = useState<TtsVoice[]>([]);

  useEffect(() => {
    let cancelled = false;
    aituberApi
      .listVoices()
      .then(({ voices }) => {
        if (!cancelled) setVoices(voices);
      })
      .catch((err) => console.warn("Failed to load TTS voices:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  const displayError = error ?? saveError;

  const submit = async () => {
    setIsSaving(true);
    setSaveError(null);
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
    } catch (err) {
      setSaveError(getApiErrorMessage(err, t("admin.agents.saveError")));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <LlmSettingsSection onTestModal={setTestModal} />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-gray-200 bg-white p-6">
          {displayError ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <span>{displayError}</span>
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
                      defaultProvider: (VALID_PROVIDERS as readonly string[]).includes(
                        agent.defaultProvider
                      )
                        ? (agent.defaultProvider as CreateAgentRequest["defaultProvider"])
                        : "google",
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
              <span className="inline-flex items-center gap-1">
                {t("admin.agents.name")}
                <Tooltip text={t("admin.agents.tooltips.name")} />
              </span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="block text-sm text-gray-700">
              <span className="inline-flex items-center gap-1">
                {t("admin.agents.descriptionLabel")}
                <Tooltip text={t("admin.agents.tooltips.description")} />
              </span>
              <input
                value={form.description ?? ""}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </label>

            <label className="block text-sm text-gray-700">
              <span className="inline-flex items-center gap-1">
                {t("admin.agents.interventionStyle")}
                <Tooltip text={t("admin.agents.tooltips.interventionStyle")} />
              </span>
              <select
                value={form.interventionStyle}
                onChange={(event) => {
                  const value = event.target.value;
                  if (
                    !VALID_INTERVENTION_STYLES.includes(
                      value as (typeof VALID_INTERVENTION_STYLES)[number]
                    )
                  )
                    return;
                  setForm((current) => ({ ...current, interventionStyle: value }));
                }}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              >
                {VALID_INTERVENTION_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {style}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-gray-700">
              <span className="inline-flex items-center gap-1">
                {t("admin.agents.voiceProfile")}
                <Tooltip text={t("admin.agents.tooltips.voiceProfile")} />
              </span>
              <select
                value={form.voiceProfile ?? ""}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    voiceProfile: event.target.value || null,
                  }))
                }
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              >
                <option value="">{t("admin.agents.voiceDefault")}</option>
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.gender}, {v.languageCodes.join(", ")})
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-gray-700">
              <span className="inline-flex items-center gap-1">
                {t("admin.agents.providerLabel")}
                <Tooltip text={t("admin.agents.tooltips.provider")} />
              </span>
              <select
                value={form.defaultProvider}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!VALID_PROVIDERS.includes(value as (typeof VALID_PROVIDERS)[number])) return;
                  setForm((current) => ({
                    ...current,
                    defaultProvider: value as CreateAgentRequest["defaultProvider"],
                  }));
                }}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              >
                <option value="google">{formatters.provider("google")}</option>
                <option value="vertex">{formatters.provider("vertex")}</option>
                <option value="zhipu">{formatters.provider("zhipu")}</option>
                <option value="openai-compatible">
                  {formatters.provider("openai-compatible")}
                </option>
              </select>
            </label>

            <label className="block text-sm text-gray-700">
              <span className="inline-flex items-center gap-1">
                {t("admin.agents.systemPrompt")}
                <Tooltip text={t("admin.agents.tooltips.systemPrompt")} />
              </span>
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
              <Tooltip text={t("admin.agents.tooltips.active")} />
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
              <Tooltip text={t("admin.agents.tooltips.autonomousEnabled")} />
            </label>

            {form.autonomousEnabled ? (
              <label className="block text-sm text-gray-700">
                <span className="inline-flex items-center gap-1">
                  {t("admin.agents.autonomousCooldown")}
                  <Tooltip text={t("admin.agents.tooltips.autonomousCooldown")} />
                </span>
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

      {testModal && <TestConnectionModal modal={testModal} onClose={() => setTestModal(null)} />}
    </div>
  );
}
