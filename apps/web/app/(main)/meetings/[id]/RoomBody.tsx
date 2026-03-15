"use client";

import AgentPanel from "@/components/livekit/AgentPanel";
import BackgroundEffectButton from "@/components/livekit/BackgroundEffectButton";
import MediaToggle from "@/components/livekit/MediaToggle";
import ParticipantTile from "@/components/livekit/ParticipantTile";
import ReactionOverlay from "@/components/livekit/ReactionOverlay";
import ReactionPicker from "@/components/livekit/ReactionPicker";
import RecordingsList from "@/components/livekit/RecordingsList";
import ScreenShareView from "@/components/livekit/ScreenShareView";
import TranscriptPanel from "@/components/livekit/TranscriptPanel";
import type { AgentDefinition, MeetingAgentEvent, RealtimeTranscriptSegment } from "@/lib/api";
import { livekitApi } from "@/lib/api";
import { useReactions } from "@/lib/hooks/use-reactions";
import { useFormatters, useT } from "@/lib/i18n";
import { ConnectionState, RoomAudioRenderer, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type OpenPanel = "agent" | "transcript" | null;

export interface RoomBodyProps {
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
}

export default function RoomBody(props: RoomBodyProps) {
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
  const [recordingPending, setRecordingPending] = useState(false);
  const recordingStartTimeRef = useRef<number | null>(null);

  // Poll recording status — stable deps (no recordingStartTime)
  useEffect(() => {
    const poll = async () => {
      try {
        const result = await livekitApi.getRecordingStatus(props.roomName, props.meetingId);
        const active = result.recordings.find(
          (r) => r.status === "starting" || r.status === "recording"
        );
        if (active) {
          setIsRecording(true);
          setRecordingEgressId(active.egressId);
          if (active.startedAt && !recordingStartTimeRef.current) {
            const ts = new Date(active.startedAt).getTime();
            recordingStartTimeRef.current = ts;
            setRecordingStartTime(ts);
          }
        } else {
          setIsRecording(false);
          setRecordingEgressId(null);
          recordingStartTimeRef.current = null;
          setRecordingStartTime(null);
        }
      } catch {
        // ignore polling errors
      }
    };
    void poll();
    const timer = window.setInterval(poll, 5000);
    return () => window.clearInterval(timer);
  }, [props.roomName, props.meetingId]);

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
    if (recordingPending) return; // Prevent concurrent calls
    setRecordingPending(true);
    try {
      if (isRecording && recordingEgressId) {
        await livekitApi.stopRecording(props.roomName, recordingEgressId);
        setIsRecording(false);
        setRecordingEgressId(null);
        recordingStartTimeRef.current = null;
        setRecordingStartTime(null);
      } else {
        const result = await livekitApi.startRecording(props.roomName, props.meetingId);
        setIsRecording(true);
        setRecordingEgressId(result.egressId);
        recordingStartTimeRef.current = Date.now();
        setRecordingStartTime(Date.now());
      }
    } catch {
      // ignore
    } finally {
      setRecordingPending(false);
    }
  }, [isRecording, recordingEgressId, recordingPending, props.roomName, props.meetingId]);

  const formatElapsed = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
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
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
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
            onClick={() => setOpenPanel((v) => (v === "transcript" ? null : "transcript"))}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
            title={t("meetings.room.realtimeTranscript")}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
              />
            </svg>
          </button>

          {/* Agent panel toggle */}
          <button
            type="button"
            onClick={() => setOpenPanel((v) => (v === "agent" ? null : "agent"))}
            className={`relative rounded-lg p-2 transition-colors hover:bg-gray-800 hover:text-white ${
              props.activeAgentIds.length > 0 ? "text-blue-400" : "text-gray-400"
            }`}
            title={t("meetings.room.aiEmployee")}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
              />
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
          <span className="text-xs text-amber-300">
            {t("meetings.room.syncStale", { error: props.syncError })}
          </span>
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
                sharerIdentity={screenTracks[0]?.participant.identity ?? ""}
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
              <svg
                className="h-10 w-10 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                />
              </svg>
            </div>
            <p className="text-sm text-gray-500">{t("meetings.room.noParticipants")}</p>
          </div>
        ) : tracks.length === 1 ? (
          /* Single participant — spotlight */
          <div className="w-full max-w-4xl">
            {/* biome-ignore lint/style/noNonNullAssertion: guarded by tracks.length === 1 */}
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
          <MediaToggle
            source={Track.Source.Microphone}
            label={t("meetings.room.mic")}
            variant="dark"
          />
          <MediaToggle
            source={Track.Source.Camera}
            label={t("meetings.room.camera")}
            variant="dark"
          />
          <MediaToggle
            source={Track.Source.ScreenShare}
            label={t("meetings.room.screen")}
            variant="dark"
          />
          <BackgroundEffectButton variant="dark" />
          <ReactionPicker onReact={sendReaction} variant="dark" />

          {/* Record button */}
          <div className="group relative">
            <button
              type="button"
              onClick={() => void toggleRecording()}
              disabled={recordingPending}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
                isRecording
                  ? "bg-red-600 text-white hover:bg-red-500"
                  : "bg-gray-700/80 text-white hover:bg-gray-600"
              }`}
            >
              {isRecording ? (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
                />
              </svg>
            </button>
            <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
              {t("meetings.room.back")}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Recordings ─── */}
      <RecordingsList meetingId={props.meetingId} />

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
