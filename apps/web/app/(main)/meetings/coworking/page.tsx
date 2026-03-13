"use client";

import { useAuthContext } from "@/lib/auth-context";
import { useCoworkingLivekitSettings } from "@/lib/site-settings-context";
import {
  ConnectionState,
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useTracks,
} from "@livekit/components-react";
import { Track, type TrackPublication } from "livekit-client";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { fetchLiveKitToken, getLiveKitUrl } from "@/lib/livekit";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-core";
import BackgroundEffectButton from "@/components/livekit/BackgroundEffectButton";
import MediaToggle from "@/components/livekit/MediaToggle";

function ParticipantCard({ trackRef }: { trackRef: TrackReferenceOrPlaceholder }) {
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
      className={`group relative flex flex-col overflow-hidden rounded-xl border transition ${
        participant.isSpeaking
          ? "border-green-400 shadow-md shadow-green-100"
          : "border-gray-200 shadow-sm"
      }`}
    >
      {/* Video / Avatar area */}
      <div className="relative aspect-video bg-gray-100">
        {hasVideo ? (
          <VideoTrack
            trackRef={trackRef as import("@livekit/components-core").TrackReference}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-2xl font-bold text-white">
              {initial}
            </div>
          </div>
        )}

        {/* Speaking ring overlay */}
        {participant.isSpeaking && (
          <div className="pointer-events-none absolute inset-0 rounded-t-xl ring-2 ring-inset ring-green-400" />
        )}
      </div>

      {/* Info bar */}
      <div className="flex items-center gap-2 bg-white px-3 py-2">
        <span
          className={`h-2 w-2 flex-shrink-0 rounded-full ${
            participant.isMicrophoneEnabled ? "bg-green-500" : "bg-gray-300"
          }`}
          title={
            participant.isMicrophoneEnabled
              ? t("coworking.micEnabled")
              : t("coworking.micMuted")
          }
        />
        <span className="truncate text-sm font-medium text-gray-900">{name}</span>
        {participant.isSpeaking && (
          <span className="ml-auto flex-shrink-0 text-[10px] font-medium text-green-600">
            {t("coworking.speaking")}
          </span>
        )}
      </div>
    </div>
  );
}

function CoworkingBody() {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const t = useT();

  return (
    <div className="pb-20">
      <div className="p-6 sm:p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Header */}
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
                {t("coworking.title")}
              </h1>
              <p className="mt-1 text-sm text-gray-600">{t("coworking.description")}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 shadow-sm">
                {t("coworking.participants", { count: tracks.length })}
              </span>
              <ConnectionState className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 shadow-sm" />
            </div>
          </header>

          {/* Unified participant grid */}
          {tracks.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tracks.map((trackRef) => (
                <ParticipantCard
                  key={trackRef.participant.identity}
                  trackRef={trackRef}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gray-200 text-gray-400">
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-600">{t("coworking.empty")}</p>
              <p className="mt-1 text-xs text-gray-400">{t("coworking.emptyHint")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Media controls — fixed to bottom */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-center px-4 py-3 md:left-16">
        <div className="flex items-center gap-2 rounded-2xl bg-white/90 px-4 py-2.5 shadow-xl ring-1 ring-gray-200/50 backdrop-blur">
          <MediaToggle source={Track.Source.Microphone} label={t("meetings.room.mic")} />
          <MediaToggle source={Track.Source.Camera} label={t("meetings.room.camera")} />
          <MediaToggle source={Track.Source.ScreenShare} label={t("meetings.room.screen")} />
          <BackgroundEffectButton />
        </div>
      </div>

      <RoomAudioRenderer />
    </div>
  );
}

export default function CoworkingPage() {
  const { user } = useAuthContext();
  const t = useT();
  const lkSettings = useCoworkingLivekitSettings();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const run = async () => {
      try {
        setError(null);
        const participantIdentity =
          user?.id ?? `user-${Math.random().toString(36).slice(2, 10)}`;
        const fetched = await fetchLiveKitToken({
          roomName: "everybody-coworking",
          participantName: user?.name ?? t("coworking.guest"),
          participantIdentity,
        });
        setToken(fetched);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("coworking.tokenError"));
      }
    };

    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryNonce, user?.id, user?.name]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
        <button
          type="button"
          onClick={() => setRetryNonce((current) => current + 1)}
          className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          {t("common.actions.retry")}
        </button>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-500">
        {t("coworking.joining")}
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={getLiveKitUrl()}
      connect={true}
      video={true}
      audio={false}
      options={{
        dynacast: lkSettings.dynacast,
        adaptiveStream: lkSettings.adaptiveStream ? { pixelDensity: "screen" } : false,
        publishDefaults: { simulcast: lkSettings.simulcast },
      }}
      className="h-full"
    >
      <CoworkingBody />
    </LiveKitRoom>
  );
}
