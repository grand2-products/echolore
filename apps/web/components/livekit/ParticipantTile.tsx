"use client";

import { useT } from "@/lib/i18n";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-core";
import { VideoTrack } from "@livekit/components-react";
import type { TrackPublication } from "livekit-client";

export interface ParticipantTileProps {
  trackRef: TrackReferenceOrPlaceholder;
}

export default function ParticipantTile({ trackRef }: ParticipantTileProps) {
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
