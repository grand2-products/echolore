"use client";

import {
  type AgentDefinition,
  type MeetingAgentEvent,
  type MeetingAgentSession,
  type MeetingAgentResponse,
  type RealtimeTranscriptSegment,
  adminApi,
  meetingsApi,
  useAuthMeQuery,
} from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { translate, useFormatters, useLocale, useT } from "@/lib/i18n";
import { fetchLiveKitToken, getLiveKitUrl } from "@/lib/livekit";
import { useStableEvent } from "@/lib/use-stable-event";
import {
  ConnectionState,
  LiveKitRoom,
  RoomAudioRenderer,
  TrackToggle,
  useTracks,
} from "@livekit/components-react";
import { Room, Track } from "livekit-client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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

function AgentPanel(props: {
  meetingId: string;
  agents: AgentDefinition[];
  activeAgentIds: string[];
  onAgentInvoked: (agentId: string) => void;
  onAgentLeft: (agentId: string) => void;
  events: MeetingAgentEvent[];
}) {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const locale = useLocale();
  const { time, number, interventionStyle, provider, eventType } = useFormatters();
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState<MeetingAgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInvoking, setIsInvoking] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);

  useEffect(() => {
    const firstAgent = props.agents[0];
    if (!selectedAgentId && firstAgent) {
      setSelectedAgentId(firstAgent.id);
    }
  }, [props.agents, selectedAgentId]);

  const selectedAgent = props.agents.find((agent) => agent.id === selectedAgentId) ?? null;
  const selectedAgentIsActive = selectedAgentId ? props.activeAgentIds.includes(selectedAgentId) : false;

  const invokeAgent = async () => {
    if (!selectedAgentId) return;
    setIsInvoking(true);
    setError(null);
    try {
      await meetingsApi.invokeAgent(props.meetingId, selectedAgentId);
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
    setVoiceStatus(null);
    try {
      const result = await meetingsApi.respondAsAgent(props.meetingId, selectedAgentId, {
        prompt: prompt.trim(),
        languageCode: localeToLanguageCode(locale),
      });
      setResponse(result);
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
    try {
      await meetingsApi.leaveAgent(props.meetingId, selectedAgentId);
      props.onAgentLeft(selectedAgentId);
    } catch (leaveError) {
      setError(getApiErrorMessage(leaveError, t("meetings.room.leaveError")));
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-gray-700 bg-gray-800 p-4 text-white">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("meetings.room.aiEmployee")}</h2>
        {props.activeAgentIds.length > 0 ? (
          <span className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300">
            {t("meetings.room.activeAgents", { count: number(props.activeAgentIds.length) })}
          </span>
        ) : (
          <span className="rounded-full bg-gray-700 px-2 py-1 text-xs text-gray-300">
            {t("meetings.room.idle")}
          </span>
        )}
      </div>

      <div className="space-y-3">
        {props.agents.length === 0 ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            {t("meetings.room.noAgents")}
          </div>
        ) : (
          <select
            value={selectedAgentId}
            onChange={(event) => setSelectedAgentId(event.target.value)}
            className="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm"
          >
            {props.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        )}

        {selectedAgent ? (
          <div className="rounded-md bg-gray-900/60 p-3 text-sm text-gray-300">
            <div>{selectedAgent.description || t("meetings.room.noDescription")}</div>
            <div className="mt-2 text-xs text-gray-400">
              {t("meetings.room.agentMeta", {
                style: interventionStyle(selectedAgent.interventionStyle),
                provider: provider(selectedAgent.defaultProvider),
              })}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={invokeAgent}
          disabled={!selectedAgentId || isInvoking}
          className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-60"
        >
          {isInvoking
            ? t("meetings.room.invoking")
            : selectedAgentIsActive
              ? t("meetings.room.invoked")
              : t("meetings.room.invoke")}
        </button>

        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={4}
          placeholder={t("meetings.room.promptPlaceholder")}
          className="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm"
        />

        <button
          type="button"
          onClick={respond}
          disabled={!selectedAgentIsActive || isResponding || !prompt.trim()}
          className="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm font-medium hover:bg-gray-700 disabled:opacity-60"
        >
          {isResponding ? t("meetings.room.generating") : t("meetings.room.getResponse")}
        </button>

        <button
          type="button"
          onClick={leaveAgent}
          disabled={!selectedAgentIsActive || isLeaving}
          className="w-full rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-100 hover:bg-red-500/20 disabled:opacity-60"
        >
          {isLeaving ? t("meetings.room.leaving") : t("meetings.room.leave")}
        </button>

        {error ? <div className="text-sm text-red-300">{error}</div> : null}
        {voiceStatus ? <div className="text-sm text-emerald-300">{voiceStatus}</div> : null}

        {response ? (
          <div className="space-y-2 rounded-md border border-gray-700 bg-gray-900/60 p-3">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              {response.agent.name}
            </div>
            <pre className="whitespace-pre-wrap text-sm text-gray-100">{response.responseText}</pre>
            <div className="text-xs text-gray-400">
              {t("meetings.room.audio", {
                value: response.audio ? response.audio.mimeType : t("meetings.room.notAvailable"),
              })}
            </div>
          </div>
        ) : null}

        <div className="rounded-md border border-gray-700 bg-gray-900/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-gray-400">
              {t("meetings.room.agentTimeline")}
            </div>
            <div className="text-xs text-gray-500">
              {t("meetings.room.eventCount", { count: number(props.events.length) })}
            </div>
          </div>
          <div className="max-h-56 space-y-2 overflow-auto">
            {props.events.length === 0 ? (
              <div className="text-sm text-gray-400">{t("meetings.room.noEvents")}</div>
            ) : (
              [...props.events].reverse().map((event) => (
                <div key={event.id} className="rounded-md bg-gray-950/70 p-2">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{eventType(event.eventType)}</span>
                    <span>{time(event.createdAt)}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {t("meetings.room.agentLabel", { id: event.agentId })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function TranscriptPanel({ segments }: { segments: RealtimeTranscriptSegment[] }) {
  const t = useT();
  const { number } = useFormatters();

  return (
    <section className="rounded-lg border border-gray-700 bg-gray-800 p-4 text-white">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("meetings.room.realtimeTranscript")}</h2>
        <span className="text-xs text-gray-400">
          {t("meetings.room.segmentCount", { count: number(segments.length) })}
        </span>
      </div>
      <div className="max-h-80 space-y-2 overflow-auto">
        {segments.length === 0 ? (
          <div className="text-sm text-gray-400">{t("meetings.room.noTranscript")}</div>
        ) : (
          segments.map((segment) => (
            <div key={segment.id} className="rounded-md bg-gray-900/60 p-3">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{segment.speakerLabel}</span>
                <span>{segment.isPartial ? t("meetings.room.partial") : t("meetings.room.final")}</span>
              </div>
              <div className="mt-1 text-sm text-gray-100">{segment.content}</div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function RoomBody(props: {
  meetingId: string;
  agents: AgentDefinition[];
  activeAgentIds: string[];
  onAgentInvoked: (agentId: string) => void;
  onAgentLeft: (agentId: string) => void;
  transcriptSegments: RealtimeTranscriptSegment[];
  agentEvents: MeetingAgentEvent[];
  syncError: string | null;
  lastSyncedAt: string | null;
}) {
  const t = useT();
  const { time, number } = useFormatters();
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);

  return (
    <div className="flex h-full flex-col bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-3">
        <Link href="/meetings" className="text-gray-300 hover:text-white">
          {t("meetings.room.back")}
        </Link>
        <div className="flex items-center gap-3">
          <ConnectionState className="rounded-full bg-gray-700 px-3 py-1 text-sm text-gray-100" />
          <span className="text-sm text-gray-300">
            {t("meetings.room.participants", { count: number(tracks.length) })}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            {props.syncError ? (
              <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                {t("meetings.room.syncStale", { error: props.syncError })}
              </div>
            ) : props.lastSyncedAt ? (
              <div className="text-xs text-gray-400">
                {t("meetings.room.lastSynced", { value: time(props.lastSyncedAt) })}
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tracks.map((trackRef) => (
                <div
                  key={trackRef.participant.identity}
                  className="rounded-lg border border-gray-700 bg-gray-800 p-4 text-white"
                >
                  <div className="font-medium">
                    {trackRef.participant.name ?? trackRef.participant.identity}
                  </div>
                  <div className="mt-1 text-xs text-gray-300">
                    {trackRef.participant.isMicrophoneEnabled
                      ? t("meetings.room.micOn")
                      : t("meetings.room.muted")}
                  </div>
                </div>
              ))}
            </div>
            <TranscriptPanel segments={props.transcriptSegments} />
          </div>

          <AgentPanel
            meetingId={props.meetingId}
            agents={props.agents}
            activeAgentIds={props.activeAgentIds}
            onAgentInvoked={props.onAgentInvoked}
            onAgentLeft={props.onAgentLeft}
            events={props.agentEvents}
          />
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-gray-700 bg-gray-800 p-4">
        <TrackToggle source={Track.Source.Microphone}>{t("meetings.room.mic")}</TrackToggle>
        <TrackToggle source={Track.Source.Camera}>{t("meetings.room.camera")}</TrackToggle>
        <TrackToggle source={Track.Source.ScreenShare}>{t("meetings.room.screen")}</TrackToggle>
      </div>

      <RoomAudioRenderer />
    </div>
  );
}

export default function MeetingRoomPage() {
  const params = useParams();
  const meetingId = params.id as string;
  const { data: auth } = useAuthMeQuery();
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const locale = useLocale();
  const [title, setTitle] = useState<string>(meetingId);
  const [roomName, setRoomName] = useState<string>(meetingId);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [activeAgentSessions, setActiveAgentSessions] = useState<MeetingAgentSession[]>([]);
  const [transcriptSegments, setTranscriptSegments] = useState<RealtimeTranscriptSegment[]>([]);
  const [agentEvents, setAgentEvents] = useState<MeetingAgentEvent[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
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
          auth?.user?.id ?? `user-${Math.random().toString(36).slice(2, 10)}`;
        const fetched = await fetchLiveKitToken({
          roomName: detail.meeting.roomName,
          participantName:
            auth?.user?.name ?? translate(locale, "meetings.room.guestUser"),
          participantIdentity,
        });
        setToken(fetched);
      } catch (err) {
        setError(getApiErrorMessage(err, translate(locale, "meetings.room.loadError")));
      }
    };

    void run();
  }, [auth?.user?.id, auth?.user?.name, locale, meetingId]);

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
        setLastSyncedAt(new Date().toISOString());
      } catch (syncFailure) {
        setSyncError(getApiErrorMessage(syncFailure, translate(locale, "meetings.room.syncError")));
      }
    };

    void sync();
    const timer = window.setInterval(() => {
      void sync();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [locale, meetingId]);

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

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!token) {
    return (
      <div className="p-8 text-gray-600">
        {t("meetings.room.loadingWithLabel", { label: meetingLabel })}
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={getLiveKitUrl()}
      connect={true}
      className="h-full"
      data-lk-theme="default"
    >
      <RoomBody
        meetingId={meetingId}
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
                    invokedByUserId: auth?.user?.id ?? "unknown",
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
        lastSyncedAt={lastSyncedAt}
      />
    </LiveKitRoom>
  );
}
