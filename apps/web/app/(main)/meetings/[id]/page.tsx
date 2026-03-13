"use client";

import {
  type AgentDefinition,
  type MeetingAgentEvent,
  type MeetingAgentSession,
  type MeetingAgentResponse,
  type RealtimeTranscriptSegment,
  adminApi,
  livekitApi,
  meetingsApi,
} from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useAuthContext } from "@/lib/auth-context";
import { useMeetingLivekitSettings } from "@/lib/site-settings-context";
import { translate, useFormatters, useLocale, useT } from "@/lib/i18n";
import { fetchLiveKitToken, getLiveKitUrl } from "@/lib/livekit";
import { useStableEvent } from "@/lib/use-stable-event";
import {
  ConnectionState,
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useTracks,
} from "@livekit/components-react";
import { Room, Track, type TrackPublication } from "livekit-client";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-core";
import BackgroundEffectButton from "@/components/livekit/BackgroundEffectButton";
import MediaToggle from "@/components/livekit/MediaToggle";
import ReactionOverlay from "@/components/livekit/ReactionOverlay";
import ReactionPicker from "@/components/livekit/ReactionPicker";
import ScreenShareView from "@/components/livekit/ScreenShareView";
import { useReactions } from "@/lib/use-reactions";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type OpenPanel = "agent" | "transcript" | null;

function localeToLanguageCode(locale: string) {
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

/* ─── Agent Side Panel (Drawer) ─── */

function AgentPanel(props: {
  meetingId: string;
  agents: AgentDefinition[];
  activeAgentIds: string[];
  onAgentInvoked: (agentId: string) => void;
  onAgentLeft: (agentId: string) => void;
  events: MeetingAgentEvent[];
  open: boolean;
  onClose: () => void;
}) {
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

  useEffect(() => {
    if (!props.open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [props.open, props.onClose]);

  useEffect(() => {
    const firstAgent = props.agents[0];
    if (!selectedAgentId && firstAgent) {
      setSelectedAgentId(firstAgent.id);
    }
  }, [props.agents, selectedAgentId]);

  const selectedAgent = props.agents.find((agent) => agent.id === selectedAgentId) ?? null;
  const selectedAgentIsActive = selectedAgentId ? props.activeAgentIds.includes(selectedAgentId) : false;
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
        const audio = new Audio(`data:${result.audio.mimeType};base64,${result.audio.base64}`);
        try {
          await audio.play();
          setVoiceStatus(t("meetings.room.voicePlaying"));
        } catch {
          setVoiceStatus(t("meetings.room.voiceBlocked"));
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
      {/* Backdrop */}
      {props.open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={props.onClose}
        />
      )}

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("meetings.room.aiEmployee")}
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-gray-700/50 bg-gray-900 shadow-2xl transition-transform duration-300 ${
          props.open ? "translate-x-0" : "translate-x-full"
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
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
              <div className="text-sm text-gray-300">{selectedAgent.description || t("meetings.room.noDescription")}</div>
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

          {error ? <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div> : null}
          {notice ? <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{notice}</div> : null}
          {voiceStatus ? <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{voiceStatus}</div> : null}

          {response ? (
            <div className="space-y-2 rounded-lg border border-gray-700/50 bg-gray-800/80 p-3.5">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
                {response.agent.name}
              </div>
              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-100">{response.responseText}</pre>
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
                        isAuto
                          ? "border border-purple-500/30 bg-purple-900/20"
                          : "bg-gray-900/70"
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
      </aside>
    </>
  );
}

/* ─── Transcript Panel ─── */

function TranscriptPanel({ segments, open, onClose }: { segments: RealtimeTranscriptSegment[]; open: boolean; onClose: () => void }) {
  const t = useT();
  const { number } = useFormatters();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [segments]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        />
      )}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("meetings.room.realtimeTranscript")}
        className={`fixed left-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-r border-gray-700/50 bg-gray-900 shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-gray-700/50 px-5 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-white">{t("meetings.room.realtimeTranscript")}</h2>
            <span className="rounded-full bg-gray-700/60 px-2 py-0.5 text-xs text-gray-400">
              {t("meetings.room.segmentCount", { count: number(segments.length) })}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
          {segments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg className="mb-3 h-10 w-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              </svg>
              <p className="text-sm text-gray-500">{t("meetings.room.noTranscript")}</p>
            </div>
          ) : (
            segments.map((segment) => (
              <div key={segment.id} className="rounded-lg bg-gray-800/80 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-blue-400">{segment.speakerLabel}</span>
                  <span className={segment.isPartial ? "text-amber-400" : "text-gray-500"}>
                    {segment.isPartial ? t("meetings.room.partial") : t("meetings.room.final")}
                  </span>
                </div>
                <div className="mt-1.5 text-sm leading-relaxed text-gray-200">{segment.content}</div>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}

/* ─── Participant Video Card ─── */

function ParticipantTile({ trackRef }: { trackRef: TrackReferenceOrPlaceholder }) {
  const t = useT();
  const { participant } = trackRef;
  const hasVideo =
    trackRef.publication !== undefined &&
    (trackRef.publication as TrackPublication).isSubscribed &&
    !trackRef.publication.isMuted;
  const name = participant.name || participant.identity;
  const initial = name.charAt(0).toUpperCase();

  return (
    <div
      className={`relative overflow-hidden rounded-xl transition-shadow ${
        participant.isSpeaking
          ? "ring-2 ring-green-400 shadow-lg shadow-green-500/20"
          : "ring-1 ring-white/10"
      }`}
    >
      <div className="relative aspect-video bg-gray-800">
        {hasVideo ? (
          <VideoTrack
            trackRef={trackRef as import("@livekit/components-core").TrackReference}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-2xl font-bold text-white shadow-lg">
              {initial}
            </div>
          </div>
        )}

        {/* Bottom name bar */}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2.5 pt-6">
          <span
            className={`h-2 w-2 flex-shrink-0 rounded-full ${
              participant.isMicrophoneEnabled ? "bg-green-400" : "bg-red-400"
            }`}
          />
          <span className="truncate text-sm font-medium text-white">{name}</span>
          {participant.isSpeaking && (
            <span className="ml-auto flex-shrink-0 rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-medium text-green-300">
              {t("meetings.room.speaking")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Room Body ─── */

function RoomBody(props: {
  meetingId: string;
  title: string;
  userName: string;
  roomName: string;
  agents: AgentDefinition[];
  activeAgentIds: string[];
  onAgentInvoked: (agentId: string) => void;
  onAgentLeft: (agentId: string) => void;
  transcriptSegments: RealtimeTranscriptSegment[];
  agentEvents: MeetingAgentEvent[];
  syncError: string | null;
  onRetrySync: () => void;
}) {
  const t = useT();
  const router = useRouter();
  const { number } = useFormatters();
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const screenTracks = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }]);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const closePanel = useCallback(() => setOpenPanel(null), []);
  const { reactions, sendReaction, removeReaction } = useReactions(props.userName);
  const hasScreenShare = screenTracks.length > 0;

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingEgressId, setRecordingEgressId] = useState<string | null>(null);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [recordingElapsed, setRecordingElapsed] = useState(0);

  // Poll recording status
  useEffect(() => {
    const poll = async () => {
      try {
        const result = await livekitApi.getRecordingStatus(props.roomName, props.meetingId);
        const active = result.recordings.find(
          (r) => r.status === "starting" || r.status === "recording",
        );
        if (active) {
          setIsRecording(true);
          setRecordingEgressId(active.egressId);
          if (active.startedAt && !recordingStartTime) {
            setRecordingStartTime(new Date(active.startedAt).getTime());
          }
        } else {
          setIsRecording(false);
          setRecordingEgressId(null);
          setRecordingStartTime(null);
        }
      } catch {
        // ignore polling errors
      }
    };
    void poll();
    const timer = window.setInterval(poll, 5000);
    return () => window.clearInterval(timer);
  }, [props.roomName, props.meetingId, recordingStartTime]);

  // Elapsed timer
  useEffect(() => {
    if (!recordingStartTime) {
      setRecordingElapsed(0);
      return;
    }
    const timer = window.setInterval(() => {
      setRecordingElapsed(Math.floor((Date.now() - recordingStartTime) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recordingStartTime]);

  const toggleRecording = useCallback(async () => {
    if (isRecording && recordingEgressId) {
      try {
        await livekitApi.stopRecording(props.roomName, recordingEgressId);
        setIsRecording(false);
        setRecordingEgressId(null);
        setRecordingStartTime(null);
      } catch {
        // ignore
      }
    } else {
      try {
        const result = await livekitApi.startRecording(props.roomName, props.meetingId);
        setIsRecording(true);
        setRecordingEgressId(result.egressId);
        setRecordingStartTime(Date.now());
      } catch {
        // ignore
      }
    }
  }, [isRecording, recordingEgressId, props.roomName, props.meetingId]);

  const formatElapsed = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div className="flex h-full flex-col bg-gray-950">
      {/* ─── Top bar ─── */}
      <header className="flex items-center justify-between border-b border-gray-800 bg-gray-900/80 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/meetings"
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </Link>
          <div>
            <h1 className="text-sm font-semibold text-white">{props.title}</h1>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <ConnectionState />
              <span>{t("meetings.room.participants", { count: number(tracks.length) })}</span>
              {isRecording && (
                <span className="flex items-center gap-1 rounded-full bg-red-600/20 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                  REC {formatElapsed(recordingElapsed)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Transcript toggle */}
          <button
            type="button"
            onClick={() => setOpenPanel((v) => v === "transcript" ? null : "transcript")}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
            title={t("meetings.room.realtimeTranscript")}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
          </button>

          {/* Agent panel toggle */}
          <button
            type="button"
            onClick={() => setOpenPanel((v) => v === "agent" ? null : "agent")}
            className={`relative rounded-lg p-2 transition-colors hover:bg-gray-800 hover:text-white ${
              props.activeAgentIds.length > 0 ? "text-blue-400" : "text-gray-400"
            }`}
            title={t("meetings.room.aiEmployee")}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
            {props.activeAgentIds.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white">
                {props.activeAgentIds.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ─── Sync status ─── */}
      {props.syncError && (
        <div className="flex items-center justify-between border-b border-amber-500/20 bg-amber-500/10 px-4 py-2">
          <span className="text-xs text-amber-300">{t("meetings.room.syncStale", { error: props.syncError })}</span>
          <button
            type="button"
            onClick={props.onRetrySync}
            className="rounded-md bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/30"
          >
            {t("common.actions.retry")}
          </button>
        </div>
      )}

      {/* ─── Video grid (center stage) ─── */}
      <div className="relative flex flex-1 items-center justify-center overflow-auto p-4">
        <ReactionOverlay reactions={reactions} onComplete={removeReaction} />
        {hasScreenShare ? (
          /* Screen share mode: main screen + camera sidebar */
          <div className="flex h-full w-full gap-3">
            <div className="relative flex-1">
              <ScreenShareView
                trackRef={screenTracks[0] as import("@livekit/components-core").TrackReference}
                sharerIdentity={screenTracks[0]!.participant.identity}
                localIdentity={tracks[0]?.participant.identity ?? ""}
              />
            </div>
            <div className="flex w-48 flex-shrink-0 flex-col gap-2 overflow-y-auto">
              {tracks.map((trackRef) => (
                <ParticipantTile key={trackRef.participant.identity} trackRef={trackRef} />
              ))}
            </div>
          </div>
        ) : tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gray-800">
              <svg className="h-10 w-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">{t("meetings.room.noParticipants")}</p>
          </div>
        ) : tracks.length === 1 ? (
          /* Single participant — spotlight */
          <div className="w-full max-w-4xl">
            <ParticipantTile trackRef={tracks[0]!} />
          </div>
        ) : tracks.length <= 4 ? (
          /* 2-4 participants — 2x2 grid */
          <div className="grid w-full max-w-5xl gap-3 sm:grid-cols-2">
            {tracks.map((trackRef) => (
              <ParticipantTile key={trackRef.participant.identity} trackRef={trackRef} />
            ))}
          </div>
        ) : (
          /* 5+ participants — responsive grid */
          <div className="grid w-full max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tracks.map((trackRef) => (
              <ParticipantTile key={trackRef.participant.identity} trackRef={trackRef} />
            ))}
          </div>
        )}
      </div>

      {/* ─── Floating control bar ─── */}
      <div className="flex items-center justify-center gap-2 p-4">
        <div className="flex items-center gap-2 rounded-2xl bg-gray-900/90 px-4 py-2.5 shadow-2xl ring-1 ring-white/10 backdrop-blur">
          <MediaToggle source={Track.Source.Microphone} label={t("meetings.room.mic")} variant="dark" />
          <MediaToggle source={Track.Source.Camera} label={t("meetings.room.camera")} variant="dark" />
          <MediaToggle source={Track.Source.ScreenShare} label={t("meetings.room.screen")} variant="dark" />
          <BackgroundEffectButton variant="dark" />
          <ReactionPicker onReact={sendReaction} variant="dark" />

          {/* Record button */}
          <div className="group relative">
            <button
              type="button"
              onClick={() => void toggleRecording()}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
                isRecording
                  ? "bg-red-600 text-white hover:bg-red-500"
                  : "bg-gray-700/80 text-white hover:bg-gray-600"
              }`}
            >
              {isRecording ? (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="7" />
                </svg>
              )}
            </button>
            <span className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {isRecording ? t("meetings.room.stopRecording") : t("meetings.room.startRecording")}
            </span>
          </div>

          {/* Divider */}
          <div className="mx-1 h-7 w-px bg-gray-700" />

          {/* Leave button */}
          <div className="group relative">
            <button
              type="button"
              onClick={() => router.push("/meetings")}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-500"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
            </button>
            <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {t("meetings.room.back")}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Drawers ─── */}
      <TranscriptPanel
        segments={props.transcriptSegments}
        open={openPanel === "transcript"}
        onClose={closePanel}
      />
      <AgentPanel
        meetingId={props.meetingId}
        agents={props.agents}
        activeAgentIds={props.activeAgentIds}
        onAgentInvoked={props.onAgentInvoked}
        onAgentLeft={props.onAgentLeft}
        events={props.agentEvents}
        open={openPanel === "agent"}
        onClose={closePanel}
      />

      <RoomAudioRenderer />
    </div>
  );
}

/* ─── Page ─── */

export default function MeetingRoomPage() {
  const params = useParams();
  const meetingId = params.id as string;
  const { user } = useAuthContext();
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const locale = useLocale();
  const lkSettings = useMeetingLivekitSettings();
  const [title, setTitle] = useState<string>(meetingId);
  const [roomName, setRoomName] = useState<string>(meetingId);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [activeAgentSessions, setActiveAgentSessions] = useState<MeetingAgentSession[]>([]);
  const [transcriptSegments, setTranscriptSegments] = useState<RealtimeTranscriptSegment[]>([]);
  const [agentEvents, setAgentEvents] = useState<MeetingAgentEvent[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const agentRoomMapRef = useRef<Map<string, Room>>(new Map());

  useEffect(() => {
    const run = async () => {
      try {
        const [detail, agentList] = await Promise.all([
          meetingsApi.get(meetingId),
          adminApi.listAgents().catch(() => ({ agents: [] })),
        ]);
        setTitle(detail.meeting.title);
        setRoomName(detail.meeting.roomName);
        setAgents(agentList.agents);

        const participantIdentity =
          user?.id ?? `user-${Math.random().toString(36).slice(2, 10)}`;
        const fetched = await fetchLiveKitToken({
          roomName: detail.meeting.roomName,
          participantName:
            user?.name ?? translate(locale, "meetings.room.guestUser"),
          participantIdentity,
        });
        setToken(fetched);
      } catch (err) {
        setError(err instanceof Error ? err.message : translate(locale, "meetings.room.loadError"));
      }
    };

    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, retryNonce, user?.id, user?.name]);

  useEffect(() => {
    const sync = async () => {
      try {
        const [transcriptResult, eventResult, sessionResult] = await Promise.all([
          meetingsApi.listRealtimeTranscripts(meetingId),
          meetingsApi.listAgentEvents(meetingId),
          meetingsApi.listActiveAgentSessions(meetingId),
        ]);
        setTranscriptSegments(transcriptResult.segments);
        setAgentEvents(eventResult.events);
        setActiveAgentSessions(sessionResult.sessions);
        setSyncError(null);
      } catch (syncFailure) {
        setSyncError(syncFailure instanceof Error ? syncFailure.message : translate(locale, "meetings.room.syncError"));
      }
    };

    void sync();
    const timer = window.setInterval(() => {
      void sync();
    }, 5000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, retryNonce]);

  const connectAgentParticipant = useStableEvent(async (agentId: string) => {
    if (!roomName || agentRoomMapRef.current.has(agentId)) {
      return;
    }

    const agent = agents.find((item) => item.id === agentId);
    if (!agent) {
      return;
    }

    const botRoom = new Room();
    try {
      const tokenValue = await fetchLiveKitToken({
        roomName,
        participantName: `${agent.name} (AI)`,
        participantIdentity: `agent-${meetingId}-${agentId}`,
      });
      await botRoom.connect(getLiveKitUrl(), tokenValue, { autoSubscribe: false });
      agentRoomMapRef.current.set(agentId, botRoom);
    } catch (connectError) {
      await botRoom.disconnect();
      setError(getApiErrorMessage(connectError, translate(locale, "meetings.room.connectAiError")));
    }
  });

  const disconnectAgentParticipant = useStableEvent(async (agentId: string) => {
    const room = agentRoomMapRef.current.get(agentId);
    if (!room) {
      return;
    }

    agentRoomMapRef.current.delete(agentId);
    await room.disconnect();
  });

  useEffect(() => {
    const activeIds = new Set(activeAgentSessions.map((session) => session.agentId));

    for (const agentId of activeIds) {
      void connectAgentParticipant(agentId);
    }

    for (const agentId of agentRoomMapRef.current.keys()) {
      if (!activeIds.has(agentId)) {
        void disconnectAgentParticipant(agentId);
      }
    }
  }, [activeAgentSessions, connectAgentParticipant, disconnectAgentParticipant]);

  useEffect(() => {
    return () => {
      for (const room of agentRoomMapRef.current.values()) {
        void room.disconnect();
      }
      agentRoomMapRef.current.clear();
    };
  }, []);

  const meetingLabel = useMemo(() => `${title} (${roomName})`, [roomName, title]);
  const activeAgentIds = useMemo(
    () => activeAgentSessions.map((session) => session.agentId),
    [activeAgentSessions]
  );

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-gray-950 p-8">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setRetryNonce((current) => current + 1);
          }}
          className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
        >
          {t("common.actions.retry")}
        </button>
      </div>
    );
  }
  if (!token) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-950">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm">{t("meetings.room.loadingWithLabel", { label: meetingLabel })}</span>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={getLiveKitUrl()}
      connect={true}
      options={{
        dynacast: lkSettings.dynacast,
        adaptiveStream: lkSettings.adaptiveStream ? { pixelDensity: "screen" } : false,
        publishDefaults: { simulcast: lkSettings.simulcast },
      }}
      className="h-full"
      data-lk-theme="default"
    >
      <RoomBody
        meetingId={meetingId}
        title={title}
        userName={user?.name ?? t("meetings.room.guestUser")}
        roomName={roomName}
        agents={agents}
        activeAgentIds={activeAgentIds}
        onAgentInvoked={(agentId) =>
          setActiveAgentSessions((current) =>
            current.some((session) => session.agentId === agentId)
              ? current
              : [
                  {
                    id: `optimistic-${agentId}`,
                    meetingId,
                    agentId,
                    state: "active",
                    invokedByUserId: user?.id ?? "unknown",
                    joinedAt: new Date().toISOString(),
                    leftAt: null,
                    createdAt: new Date().toISOString(),
                  },
                  ...current,
                ]
          )
        }
        onAgentLeft={(agentId) =>
          setActiveAgentSessions((current) =>
            current.filter((session) => session.agentId !== agentId)
          )
        }
        transcriptSegments={transcriptSegments}
        agentEvents={agentEvents}
        syncError={syncError}
        onRetrySync={() => setRetryNonce((current) => current + 1)}
      />
    </LiveKitRoom>
  );
}
