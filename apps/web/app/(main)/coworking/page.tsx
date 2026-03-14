"use client";

import { useAuthContext } from "@/lib/auth-context";
import { useCoworkingLivekitSettings } from "@/lib/site-settings-context";
import {
  ConnectionState,
  LiveKitRoom,
  RoomAudioRenderer,
  VideoTrack,
  useTracks,
  useParticipants,
} from "@livekit/components-react";
import { Track, type TrackPublication } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { COWORKING_ROOM_NAME, fetchLiveKitToken, getLiveKitUrl } from "@/lib/livekit";
import { apiFetch } from "@/lib/api";
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

async function waitForHls(signal: AbortSignal, maxAttempts = 45): Promise<boolean> {
  const url = getHlsStreamUrl();
  for (let i = 0; i < maxAttempts; i++) {
    if (signal.aborted) return false;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const body = await res.text();
        // Ignore stale playlists from a previous egress that have already ended
        if (body.includes("#EXT-X-ENDLIST") || !body.includes("#EXTINF")) {
          // Playlist is stale or empty — keep waiting for a live one
        } else {
          return true;
        }
      }
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

function getHlsStreamUrl() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL
    ? new URL(process.env.NEXT_PUBLIC_API_URL).origin
    : "";
  return `${apiBase}/api/coworking-hls/live.m3u8`;
}

function CoworkingMcuBody() {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const participants = useParticipants();
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false },
  );
  const [hlsError, setHlsError] = useState<string | null>(null);
  const [hlsLoading, setHlsLoading] = useState(true);
  const [hlsRetry, setHlsRetry] = useState(0);
  // Track whether composite has been started so we don't re-trigger on every track change
  const compositeStarted = useRef(false);

  const hasPublishedTracks = tracks.length > 0;

  const initHls = useCallback(async (signal: AbortSignal) => {
    // Ensure composite is running
    try {
      await apiFetch("/livekit/coworking/start-composite", { method: "POST" });
    } catch (err) {
      console.warn("[coworking-mcu] Failed to start composite:", err);
    }

    if (signal.aborted) return undefined;

    // Wait for Egress to produce initial HLS segments
    const hlsReady = await waitForHls(signal);
    if (!hlsReady || signal.aborted || !videoRef.current) return undefined;

    const Hls = (await import("hls.js")).default;

    if (signal.aborted || !videoRef.current) return undefined;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        liveSyncDurationCount: 3,
      });

      hls.loadSource(getHlsStreamUrl());
      hls.attachMedia(videoRef.current);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setHlsLoading(false);
        setHlsError(null);
        videoRef.current?.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setHlsError(t("coworking.mcu.hlsError"));
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setTimeout(() => {
              setHlsError(null);
              setHlsLoading(true);
              hls.startLoad();
            }, 3000);
          }
        }
      });

      return () => {
        hls.destroy();
      };
    }

    if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari native HLS
      const video = videoRef.current;
      const onMeta = () => {
        setHlsLoading(false);
        video.play().catch(() => {});
      };
      video.src = getHlsStreamUrl();
      video.addEventListener("loadedmetadata", onMeta);
      return () => {
        video.removeEventListener("loadedmetadata", onMeta);
        video.src = "";
      };
    }

    setHlsError(t("coworking.mcu.hlsUnsupported"));
    return undefined;
  }, [t]);

  // Start HLS only after at least one video track is published in the room
  useEffect(() => {
    if (!hasPublishedTracks || compositeStarted.current) return;
    compositeStarted.current = true;

    const ac = new AbortController();
    let cleanup: (() => void) | undefined;

    setHlsError(null);
    setHlsLoading(true);

    initHls(ac.signal).then((c) => {
      if (ac.signal.aborted) {
        c?.();
      } else {
        cleanup = c;
      }
    });

    return () => {
      ac.abort();
      cleanup?.();
      compositeStarted.current = false;
    };
  }, [initHls, hlsRetry, hasPublishedTracks]);

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
              <p className="mt-1 text-sm text-gray-600">{t("coworking.mcu.description")}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 shadow-sm">
                MCU
              </span>
              <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 shadow-sm">
                {t("coworking.participants", { count: participants.length })}
              </span>
              <ConnectionState className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 shadow-sm" />
            </div>
          </header>

          {/* HLS Player */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-black shadow-sm">
            {hlsLoading && !hlsError && (
              <div className="flex items-center justify-center py-32 text-gray-400">
                {t("coworking.mcu.loading")}
              </div>
            )}
            {hlsError && (
              <div className="flex flex-col items-center justify-center gap-3 py-32">
                <p className="text-sm text-red-400">{hlsError}</p>
                <button
                  type="button"
                  onClick={() => setHlsRetry((n) => n + 1)}
                  className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                >
                  {t("common.actions.retry")}
                </button>
              </div>
            )}
            <video
              ref={videoRef}
              className={`w-full ${hlsLoading || hlsError ? "hidden" : ""}`}
              autoPlay
              muted
              playsInline
            />
          </div>

          {/* Participant list */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">
              {t("coworking.mcu.participantList")}
            </h3>
            <div className="flex flex-wrap gap-2">
              {participants.map((p) => (
                <span
                  key={p.identity}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
                    p.isSpeaking
                      ? "border-green-300 bg-green-50 text-green-800"
                      : "border-gray-200 bg-gray-50 text-gray-700"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      p.isMicrophoneEnabled ? "bg-green-500" : "bg-gray-300"
                    }`}
                  />
                  {p.name || p.identity}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Media controls — fixed to bottom */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-center px-4 py-3 md:left-16">
        <div className="flex items-center gap-2 rounded-2xl bg-white/90 px-4 py-2.5 shadow-xl ring-1 ring-gray-200/50 backdrop-blur">
          <MediaToggle source={Track.Source.Microphone} label={t("meetings.room.mic")} />
          <MediaToggle source={Track.Source.Camera} label={t("meetings.room.camera")} />
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

  const isMcu = lkSettings.mode === "mcu";

  useEffect(() => {
    const run = async () => {
      try {
        setError(null);
        const participantIdentity =
          user?.id ?? `user-${Math.random().toString(36).slice(2, 10)}`;
        const fetched = await fetchLiveKitToken({
          roomName: COWORKING_ROOM_NAME,
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
        dynacast: isMcu ? false : lkSettings.dynacast,
        adaptiveStream: isMcu ? false : (lkSettings.adaptiveStream ? { pixelDensity: "screen" } : false),
        publishDefaults: isMcu
          ? {
              simulcast: false,
              videoEncoding: { maxBitrate: 150_000, maxFramerate: 10 },
            }
          : { simulcast: lkSettings.simulcast },
        videoCaptureDefaults: isMcu
          ? { resolution: { width: 320, height: 240, frameRate: 10 } }
          : undefined,
      }}
      className="h-full"
    >
      {isMcu ? <CoworkingMcuBody /> : <CoworkingBody />}
    </LiveKitRoom>
  );
}
