"use client";

import type { TrackReferenceOrPlaceholder } from "@livekit/components-core";
import {
  ConnectionState,
  RoomAudioRenderer,
  RoomContext,
  useParticipants,
  useTracks,
  VideoTrack,
} from "@livekit/components-react";
import { Track, type TrackPublication } from "livekit-client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import BackgroundEffectButton from "@/components/livekit/BackgroundEffectButton";
import MediaToggle from "@/components/livekit/MediaToggle";
import { apiFetch } from "@/lib/api";
import { fetchText } from "@/lib/api/fetch";
import { useAuthContext } from "@/lib/auth-context";
import {
  addCustomBackground,
  BACKGROUND_CATEGORIES,
  type BackgroundEffect,
  effectEquals,
  getCustomBackgrounds,
  getStoredBackgroundEffect,
  PRESET_BACKGROUNDS,
  removeCustomBackground,
  storeBackgroundEffect,
} from "@/lib/background-processor";
import { STORAGE_KEYS } from "@/lib/constants/storage-keys";
import { useCoworkingRoom } from "@/lib/coworking-room-context";
import { useT } from "@/lib/i18n";
import { useCoworkingLivekitSettings } from "@/lib/site-settings-context";

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
            participant.isMicrophoneEnabled ? t("coworking.micEnabled") : t("coworking.micMuted")
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
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false,
  });
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
                <ParticipantCard key={trackRef.participant.identity} trackRef={trackRef} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gray-200 text-gray-400">
                <svg
                  className="h-7 w-7"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                  />
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
      const body = await fetchText(url);
      // Ignore stale playlists from a previous egress that have already ended
      if (body.includes("#EXT-X-ENDLIST") || !body.includes("#EXTINF")) {
        // Playlist is stale or empty — keep waiting for a live one
      } else {
        return true;
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
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }], {
    onlySubscribed: false,
  });
  const [hlsError, setHlsError] = useState<string | null>(null);
  const [hlsLoading, setHlsLoading] = useState(true);
  const [hlsRetry, setHlsRetry] = useState(0);
  // Track whether composite has been started so we don't re-trigger on every track change
  const compositeStarted = useRef(false);

  const hasPublishedTracks = tracks.length > 0;

  const initHls = useCallback(
    async (signal: AbortSignal) => {
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
    },
    [t]
  );

  // Start HLS only after at least one video track is published in the room
  useEffect(() => {
    void hlsRetry; // re-trigger dependency
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

// Stores background effect selection to localStorage for use after joining.
// The effect is not applied to the preview stream — BackgroundEffectButton in the
// room view auto-applies the stored effect when a video track becomes available.
function PreviewBackgroundPicker() {
  const t = useT();
  const [effect, setEffect] = useState<BackgroundEffect>(getStoredBackgroundEffect());
  const [open, setOpen] = useState(false);
  const [customBgs, setCustomBgs] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCustomBgs(getCustomBackgrounds());
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = (next: BackgroundEffect) => {
    setEffect(next);
    storeBackgroundEffect(next);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      addCustomBackground(dataUrl);
      setCustomBgs(getCustomBackgrounds());
      handleSelect({ type: "image", url: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveCustom = (url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeCustomBackground(url);
    setCustomBgs(getCustomBackgrounds());
    if (typeof effect === "object" && effect.url === url) {
      handleSelect("none");
    }
  };

  const isActive = effect !== "none";

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
          isActive
            ? "bg-blue-600 text-white hover:bg-blue-500"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
        title={t("background.label")}
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
            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
          />
        </svg>
      </button>

      {open && (
        <div
          className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-4 shadow-xl"
          style={{ width: "min(420px, 90vw)" }}
        >
          {/* Blur options */}
          <div className="mb-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              {t("background.blurSection")}
            </p>
            <div className="flex gap-2">
              {(["none", "blur-light", "blur"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg border-2 text-xs font-medium transition ${
                    effectEquals(effect, opt)
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  {opt === "none" ? (
                    t("background.none")
                  ) : (
                    <svg
                      className="h-6 w-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    >
                      {opt === "blur-light" ? (
                        <circle cx="12" cy="12" r="6" strokeDasharray="3 2" />
                      ) : (
                        <>
                          <circle cx="12" cy="12" r="8" strokeDasharray="2 2" />
                          <circle cx="12" cy="12" r="4" strokeDasharray="2 2" />
                        </>
                      )}
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Custom backgrounds */}
          {customBgs.length > 0 && (
            <div className="mb-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {t("background.custom")}
              </p>
              <div className="flex flex-wrap gap-2">
                {customBgs.map((url) => (
                  <div key={url} className="group/custom relative">
                    <button
                      type="button"
                      onClick={() => handleSelect({ type: "image", url })}
                      className={`h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border-2 transition ${
                        effectEquals(effect, { type: "image", url })
                          ? "border-blue-500"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <Image
                        src={url}
                        alt=""
                        width={56}
                        height={56}
                        unoptimized
                        className="h-full w-full object-cover"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleRemoveCustom(url, e)}
                      className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white shadow group-hover/custom:flex"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preset backgrounds */}
          <div className="mb-3 max-h-52 overflow-y-auto">
            {BACKGROUND_CATEGORIES.map((cat) => {
              const presets = PRESET_BACKGROUNDS.filter((p) => p.category === cat);
              if (presets.length === 0) return null;
              return (
                <div key={cat} className="mb-2">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
                    {t(`background.cat.${cat}`)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {presets.map((preset) => {
                      const eff: BackgroundEffect = { type: "image", url: preset.url };
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleSelect(eff)}
                          title={t(`background.preset.${preset.id}`)}
                          className={`h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border-2 transition ${
                            effectEquals(effect, eff)
                              ? "border-blue-500"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <Image
                            src={preset.url}
                            alt={t(`background.preset.${preset.id}`)}
                            width={56}
                            height={56}
                            unoptimized
                            className="h-full w-full object-cover"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Upload button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 transition hover:border-gray-400 hover:bg-gray-50"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t("background.upload")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}

function CoworkingPreview({
  onJoin,
}: {
  onJoin: (opts: { camera: boolean; mic: boolean; deviceId?: string }) => void;
}) {
  const t = useT();
  const { user } = useAuthContext();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(false);
  const [joining, setJoining] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(
    () => (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEYS.videoDevice)) || ""
  );

  // Enumerate video devices (once on mount)
  useEffect(() => {
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => {
        const cameras = devices.filter((d) => d.kind === "videoinput");
        setVideoDevices(cameras);
        setSelectedDeviceId((prev) => {
          // Keep stored device if it still exists
          if (prev && cameras.some((c) => c.deviceId === prev)) return prev;
          // Fallback to first available
          return cameras[0]?.deviceId ?? "";
        });
      })
      .catch(() => {});
  }, []);

  // Start local camera preview
  useEffect(() => {
    if (!cameraOn) {
      if (streamRef.current) {
        for (const tr of streamRef.current.getTracks()) tr.stop();
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      return;
    }

    let cancelled = false;
    const constraints: MediaStreamConstraints = {
      video: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true,
      audio: false,
    };

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => {
        if (cancelled) {
          for (const tr of stream.getTracks()) tr.stop();
          return;
        }
        // Stop previous stream
        if (streamRef.current) {
          for (const tr of streamRef.current.getTracks()) tr.stop();
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        // Re-enumerate to get labels (requires active stream)
        navigator.mediaDevices
          .enumerateDevices()
          .then((devices) => {
            const cameras = devices.filter((d) => d.kind === "videoinput");
            setVideoDevices(cameras);
          })
          .catch(() => {});
      })
      .catch(() => {
        setCameraOn(false);
      });

    return () => {
      cancelled = true;
      if (streamRef.current) {
        for (const tr of streamRef.current.getTracks()) tr.stop();
        streamRef.current = null;
      }
    };
  }, [cameraOn, selectedDeviceId]);

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        for (const tr of streamRef.current.getTracks()) tr.stop();
      }
    };
  }, []);

  const name = user?.name ?? t("coworking.guest");
  const initial = name.charAt(0).toUpperCase();

  const handleJoin = async () => {
    setJoining(true);
    if (streamRef.current) {
      for (const tr of streamRef.current.getTracks()) tr.stop();
      streamRef.current = null;
    }
    try {
      await onJoin({ camera: cameraOn, mic: micOn, deviceId: selectedDeviceId || undefined });
    } catch {
      setJoining(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">{t("coworking.title")}</h1>
          <p className="mt-1 text-sm text-gray-600">{t("coworking.description")}</p>
        </div>

        {/* Camera preview */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-900 shadow-sm">
          <div className="relative aspect-video">
            {cameraOn ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
                style={{ transform: "scaleX(-1)" }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gray-800">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-600 text-3xl font-bold text-white">
                  {initial}
                </div>
              </div>
            )}
            <div className="absolute bottom-3 left-3 rounded-md bg-black/50 px-2 py-1 text-xs text-white">
              {name}
            </div>
          </div>
        </div>

        {/* Device selector */}
        {videoDevices.length > 1 && (
          <div>
            <select
              value={selectedDeviceId}
              onChange={(e) => {
                setSelectedDeviceId(e.target.value);
                localStorage.setItem(STORAGE_KEYS.videoDevice, e.target.value);
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {videoDevices.map((device, idx) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || t("coworking.preview.camera", { index: idx + 1 })}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setMicOn((v) => !v)}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
              micOn
                ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                : "bg-red-100 text-red-600 hover:bg-red-200"
            }`}
            title={t("meetings.room.mic")}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              {micOn ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                />
              )}
            </svg>
          </button>

          <button
            type="button"
            onClick={() => setCameraOn((v) => !v)}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
              cameraOn
                ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                : "bg-red-100 text-red-600 hover:bg-red-200"
            }`}
            title={t("meetings.room.camera")}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              {cameraOn ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636"
                />
              )}
            </svg>
          </button>

          <PreviewBackgroundPicker />
        </div>

        {/* Join button */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleJoin}
            disabled={joining}
            className="rounded-xl bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-60"
          >
            {joining ? t("coworking.joining") : t("coworking.preview.join")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CoworkingPage() {
  const t = useT();
  const lkSettings = useCoworkingLivekitSettings();
  const { room, isConnected, join } = useCoworkingRoom();
  const [error, setError] = useState<string | null>(null);

  const isMcu = lkSettings.mode === "mcu";

  const handleJoin = useCallback(
    async (opts: { camera: boolean; mic: boolean; deviceId?: string }) => {
      try {
        setError(null);
        await join({
          enableCamera: opts.camera,
          enableMic: opts.mic,
          videoDeviceId: opts.deviceId,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : t("coworking.tokenError"));
      }
    },
    [join, t]
  );

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
        <button
          type="button"
          onClick={() => setError(null)}
          className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          {t("common.actions.retry")}
        </button>
      </div>
    );
  }

  // Show preview if not yet connected
  if (!room || !isConnected) {
    return <CoworkingPreview onJoin={handleJoin} />;
  }

  // room is guaranteed non-null here since isConnected requires a room
  return (
    <RoomContext.Provider value={room}>
      {isMcu ? <CoworkingMcuBody /> : <CoworkingBody />}
    </RoomContext.Provider>
  );
}
