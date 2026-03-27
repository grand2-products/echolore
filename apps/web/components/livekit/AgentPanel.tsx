"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type AgentDefinition,
  type MeetingAgentEvent,
  type MeetingAgentResponse,
  meetingsApi,
} from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useFormatters, useLocale, useT } from "@/lib/i18n";
import DialogBackdrop from "./DialogBackdrop";
import { useEscapeKey } from "./use-escape-key";

export function localeToLanguageCode(locale: string) {
  switch (locale) {
    case "ja":
      return "ja-JP";
    case "zh-CN":
      return "zh-CN";
    case "ko":
      return "ko-KR";
    default:
      return "en-US";
  }
}

export interface AgentPanelProps {
  meetingId: string;
  agents: AgentDefinition[];
  activeAgentIds: string[];
  onAgentInvoked: (agentId: string) => void;
  onAgentLeft: (agentId: string) => void;
  events: MeetingAgentEvent[];
  open: boolean;
  onClose: () => void;
}

export default function AgentPanel(props: AgentPanelProps) {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const locale = useLocale();
  const { time, number, interventionStyle, provider, eventType } = useFormatters();
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<MeetingAgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isInvoking, setIsInvoking] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEscapeKey(props.open, props.onClose);

  useEffect(() => {
    const firstAgent = props.agents[0];
    if (!selectedAgentId && firstAgent) {
      setSelectedAgentId(firstAgent.id);
    }
  }, [props.agents, selectedAgentId]);

  const selectedAgent = props.agents.find((agent) => agent.id === selectedAgentId) ?? null;
  const selectedAgentIsActive = selectedAgentId
    ? props.activeAgentIds.includes(selectedAgentId)
    : false;
  const reversedEvents = useMemo(() => [...props.events].reverse(), [props.events]);

  const invokeAgent = async () => {
    if (!selectedAgentId) return;
    setIsInvoking(true);
    setError(null);
    setNotice(null);
    try {
      await meetingsApi.invokeAgent(props.meetingId, selectedAgentId);
      setNotice(t("meetings.room.invokeSuccess"));
      props.onAgentInvoked(selectedAgentId);
    } catch (invokeError) {
      setError(getApiErrorMessage(invokeError, t("meetings.room.invokeError")));
    } finally {
      setIsInvoking(false);
    }
  };

  const respond = async () => {
    if (!selectedAgentId || !prompt.trim()) return;
    setIsResponding(true);
    setError(null);
    setNotice(null);
    setVoiceStatus(null);
    try {
      const result = await meetingsApi.respondAsAgent(props.meetingId, selectedAgentId, {
        prompt: prompt.trim(),
        languageCode: localeToLanguageCode(locale),
      });
      setResponse(result);
      setNotice(t("meetings.room.respondSuccess"));
      if (result.audio) {
        // Clean up previous audio element
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = "";
        }
        const ALLOWED_AUDIO_TYPES = [
          "audio/mp3",
          "audio/mpeg",
          "audio/wav",
          "audio/webm",
          "audio/ogg",
        ];
        if (!ALLOWED_AUDIO_TYPES.includes(result.audio.mimeType)) {
          setVoiceStatus(t("meetings.room.voiceUnavailable"));
        } else {
          const audio = new Audio(`data:${result.audio.mimeType};base64,${result.audio.base64}`);
          audioRef.current = audio;
          try {
            await audio.play();
            setVoiceStatus(t("meetings.room.voicePlaying"));
          } catch {
            setVoiceStatus(t("meetings.room.voiceBlocked"));
          }
        }
      } else {
        setVoiceStatus(t("meetings.room.voiceUnavailable"));
      }
    } catch (respondError) {
      setError(getApiErrorMessage(respondError, t("meetings.room.respondError")));
    } finally {
      setIsResponding(false);
    }
  };

  const leaveAgent = async () => {
    if (!selectedAgentId || !selectedAgentIsActive) return;
    setIsLeaving(true);
    setError(null);
    setNotice(null);
    try {
      await meetingsApi.leaveAgent(props.meetingId, selectedAgentId);
      setNotice(t("meetings.room.leaveSuccess"));
      props.onAgentLeft(selectedAgentId);
    } catch (leaveError) {
      setError(getApiErrorMessage(leaveError, t("meetings.room.leaveError")));
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <>
      <DialogBackdrop open={props.open} onClose={props.onClose} />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("meetings.room.aiEmployee")}
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-gray-700/50 bg-gray-900 shadow-2xl transition-transform duration-300 ${
          props.open ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-gray-700/50 px-5 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-white">{t("meetings.room.aiEmployee")}</h2>
            {props.activeAgentIds.length > 0 ? (
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
                {t("meetings.room.activeAgents", { count: number(props.activeAgentIds.length) })}
              </span>
            ) : (
              <span className="rounded-full bg-gray-700/60 px-2 py-0.5 text-xs text-gray-400">
                {t("meetings.room.idle")}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Drawer body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {props.agents.length === 0 ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              {t("meetings.room.noAgents")}
            </div>
          ) : (
            <select
              value={selectedAgentId}
              onChange={(event) => setSelectedAgentId(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {props.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          )}

          {selectedAgent ? (
            <div className="rounded-lg bg-gray-800/80 p-3.5">
              <div className="text-sm text-gray-300">
                {selectedAgent.description || t("meetings.room.noDescription")}
              </div>
              <div className="mt-2 text-xs text-gray-500">
                {t("meetings.room.agentMeta", {
                  style: interventionStyle(selectedAgent.interventionStyle),
                  provider: provider(selectedAgent.defaultProvider),
                })}
              </div>
            </div>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={invokeAgent}
              disabled={!selectedAgentId || isInvoking}
              className="flex-1 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {isInvoking
                ? t("meetings.room.invoking")
                : selectedAgentIsActive
                  ? t("meetings.room.invoked")
                  : t("meetings.room.invoke")}
            </button>

            <button
              type="button"
              onClick={leaveAgent}
              disabled={!selectedAgentIsActive || isLeaving}
              className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
            >
              {isLeaving ? t("meetings.room.leaving") : t("meetings.room.leave")}
            </button>
          </div>

          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            placeholder={t("meetings.room.promptPlaceholder")}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          <button
            type="button"
            onClick={respond}
            disabled={!selectedAgentIsActive || isResponding || !prompt.trim()}
            className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
          >
            {isResponding ? t("meetings.room.generating") : t("meetings.room.getResponse")}
          </button>

          {error ? (
            <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
          ) : null}
          {notice ? (
            <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              {notice}
            </div>
          ) : null}
          {voiceStatus ? (
            <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              {voiceStatus}
            </div>
          ) : null}

          {response ? (
            <div className="space-y-2 rounded-lg border border-gray-700/50 bg-gray-800/80 p-3.5">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                {response.agent.name}
              </div>
              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-100">
                {response.responseText}
              </pre>
              <div className="text-xs text-gray-500">
                {t("meetings.room.audio", {
                  value: response.audio ? response.audio.mimeType : t("meetings.room.notAvailable"),
                })}
              </div>
            </div>
          ) : null}

          {/* Agent timeline */}
          <div className="rounded-lg border border-gray-700/50 bg-gray-800/60 p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                {t("meetings.room.agentTimeline")}
              </div>
              <div className="text-xs text-gray-500">
                {t("meetings.room.eventCount", { count: number(props.events.length) })}
              </div>
            </div>
            <div className="max-h-56 space-y-1.5 overflow-auto">
              {props.events.length === 0 ? (
                <div className="text-sm text-gray-500">{t("meetings.room.noEvents")}</div>
              ) : (
                reversedEvents.map((event) => {
                  const isAuto = event.eventType === "response.autonomous";
                  const responseText = isAuto
                    ? (event.payload as Record<string, unknown>)?.responseText
                    : null;

                  return (
                    <div
                      key={event.id}
                      className={`rounded-lg p-2.5 ${
                        isAuto ? "border border-purple-500/30 bg-purple-900/20" : "bg-gray-900/70"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span className="flex items-center gap-1.5">
                          {eventType(event.eventType)}
                          {isAuto ? (
                            <span className="rounded-full bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-medium text-purple-300">
                              Auto
                            </span>
                          ) : null}
                        </span>
                        <span>{time(event.createdAt)}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        {t("meetings.room.agentLabel", { id: event.agentId })}
                      </div>
                      {isAuto && typeof responseText === "string" ? (
                        <pre className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-gray-300">
                          {responseText}
                        </pre>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
