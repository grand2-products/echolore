"use client";

import {
  type AgentDefinition,
  type MeetingAgentEvent,
  type MeetingAgentSession,
  type RealtimeTranscriptSegment,
  adminApi,
  meetingsApi,
} from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useAuthContext } from "@/lib/auth-context";
import { useStableEvent } from "@/lib/hooks/use-stable-event";
import { translate, useLocale, useT } from "@/lib/i18n";
import { fetchLiveKitToken, getLiveKitUrl } from "@/lib/livekit";
import { useMeetingLivekitSettings } from "@/lib/site-settings-context";
import { LiveKitRoom } from "@livekit/components-react";
import { Room } from "livekit-client";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import RoomBody from "./RoomBody";

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
    void retryNonce; // re-trigger dependency
    const run = async () => {
      try {
        const [detail, agentList] = await Promise.all([
          meetingsApi.get(meetingId),
          adminApi.listAgents().catch(() => ({ agents: [] })),
        ]);
        setTitle(detail.meeting.title);
        setRoomName(detail.meeting.roomName);
        setAgents(agentList.agents);

        const participantIdentity = user?.id ?? `user-${Math.random().toString(36).slice(2, 10)}`;
        const fetched = await fetchLiveKitToken({
          roomName: detail.meeting.roomName,
          participantName: user?.name ?? translate(locale, "meetings.room.guestUser"),
          participantIdentity,
        });
        setToken(fetched);
      } catch (err) {
        setError(err instanceof Error ? err.message : translate(locale, "meetings.room.loadError"));
      }
    };

    void run();
  }, [meetingId, retryNonce, locale, user?.id, user?.name]);

  useEffect(() => {
    void retryNonce; // re-trigger dependency
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
        setSyncError(
          syncFailure instanceof Error
            ? syncFailure.message
            : translate(locale, "meetings.room.syncError")
        );
      }
    };

    void sync();
    const timer = window.setInterval(() => {
      void sync();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [meetingId, retryNonce, locale]);

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
          <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="text-sm">
            {t("meetings.room.loadingWithLabel", { label: meetingLabel })}
          </span>
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
