"use client";

import { RoomAudioRenderer, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import BackgroundEffectButton from "@/components/livekit/BackgroundEffectButton";
import MediaToggle from "@/components/livekit/MediaToggle";
import ParticipantTile from "@/components/livekit/ParticipantTile";
import ReactionOverlay from "@/components/livekit/ReactionOverlay";
import ReactionPicker from "@/components/livekit/ReactionPicker";
import ScreenShareView from "@/components/livekit/ScreenShareView";
import { useReactions } from "@/lib/hooks/use-reactions";

interface GuestRoomBodyProps {
  meetingTitle: string;
  guestName: string;
  onLeave: () => void;
}

export default function GuestRoomBody({ meetingTitle, guestName, onLeave }: GuestRoomBodyProps) {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const screenTracks = useTracks([{ source: Track.Source.ScreenShare, withPlaceholder: false }]);
  const { reactions, sendReaction, removeReaction } = useReactions(guestName);
  const hasScreenShare = screenTracks.length > 0;

  return (
    <div className="flex h-full flex-col bg-gray-950">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-gray-800 bg-gray-900/80 px-4 py-2.5 backdrop-blur">
        <div>
          <h1 className="text-sm font-semibold text-white">{meetingTitle}</h1>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{guestName} (ゲスト)</span>
            <span>·</span>
            <span>{tracks.length}人の参加者</span>
          </div>
        </div>
      </header>

      {/* Video grid */}
      <div className="relative flex flex-1 items-center justify-center overflow-auto p-4">
        <ReactionOverlay reactions={reactions} onComplete={removeReaction} />
        {hasScreenShare ? (
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
            <p className="text-sm text-gray-500">参加者を待っています...</p>
          </div>
        ) : tracks.length === 1 ? (
          <div className="w-full max-w-4xl">
            {/* biome-ignore lint/style/noNonNullAssertion: guarded */}
            <ParticipantTile trackRef={tracks[0]!} />
          </div>
        ) : tracks.length <= 4 ? (
          <div className="grid w-full max-w-5xl gap-3 sm:grid-cols-2">
            {tracks.map((trackRef) => (
              <ParticipantTile key={trackRef.participant.identity} trackRef={trackRef} />
            ))}
          </div>
        ) : (
          <div className="grid w-full max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tracks.map((trackRef) => (
              <ParticipantTile key={trackRef.participant.identity} trackRef={trackRef} />
            ))}
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="flex items-center justify-center gap-2 p-4">
        <div className="flex items-center gap-2 rounded-2xl bg-gray-900/90 px-4 py-2.5 shadow-2xl ring-1 ring-white/10 backdrop-blur">
          <MediaToggle source={Track.Source.Microphone} label="マイク" variant="dark" />
          <MediaToggle source={Track.Source.Camera} label="カメラ" variant="dark" />
          <MediaToggle source={Track.Source.ScreenShare} label="画面共有" variant="dark" />
          <BackgroundEffectButton variant="dark" />
          <ReactionPicker onReact={sendReaction} variant="dark" />

          <div className="mx-1 h-7 w-px bg-gray-700" />

          {/* Leave button */}
          <div className="group relative">
            <button
              type="button"
              onClick={onLeave}
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
              退出
            </span>
          </div>
        </div>
      </div>

      <RoomAudioRenderer />
    </div>
  );
}
