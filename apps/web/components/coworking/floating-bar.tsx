"use client";

import { ParticipantEvent } from "livekit-client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useCoworkingRoom } from "@/lib/coworking-room-context";
import { useT } from "@/lib/i18n";

export function CoworkingFloatingBar() {
  const { room, isConnected, leave } = useCoworkingRoom();
  const pathname = usePathname();
  const t = useT();
  const isOnCoworkingPage = pathname === "/coworking";

  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);

  // Sync local track state
  useEffect(() => {
    if (!room) return;
    const lp = room.localParticipant;
    const sync = () => {
      setCameraEnabled(lp.isCameraEnabled);
      setMicEnabled(lp.isMicrophoneEnabled);
    };
    sync();
    const events = [
      ParticipantEvent.LocalTrackPublished,
      ParticipantEvent.LocalTrackUnpublished,
      ParticipantEvent.TrackMuted,
      ParticipantEvent.TrackUnmuted,
    ] as const;
    for (const ev of events) lp.on(ev, sync);
    return () => {
      for (const ev of events) lp.off(ev, sync);
    };
  }, [room]);

  const toggleCamera = useCallback(async () => {
    if (!room) return;
    await room.localParticipant.setCameraEnabled(!cameraEnabled);
  }, [room, cameraEnabled]);

  const toggleMic = useCallback(async () => {
    if (!room) return;
    await room.localParticipant.setMicrophoneEnabled(!micEnabled);
  }, [room, micEnabled]);

  // Don't show on coworking page or when not connected
  if (isOnCoworkingPage || !isConnected) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-2xl bg-white/90 px-4 py-2.5 shadow-xl ring-1 ring-gray-200/50 backdrop-blur">
      <div className="mr-1 flex h-2 w-2 rounded-full bg-red-500" title={t("coworking.streaming")} />
      <Link href="/coworking" className="text-xs font-medium text-gray-700 hover:text-blue-600">
        {t("coworking.title")}
      </Link>

      <div className="mx-1 h-5 w-px bg-gray-200" />

      {/* Mic toggle */}
      <button
        type="button"
        onClick={() => void toggleMic()}
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
          micEnabled
            ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
            : "bg-red-100 text-red-600 hover:bg-red-200"
        }`}
        title={t("meetings.room.mic")}
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          {micEnabled ? (
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

      {/* Camera toggle */}
      <button
        type="button"
        onClick={() => void toggleCamera()}
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
          cameraEnabled
            ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
            : "bg-red-100 text-red-600 hover:bg-red-200"
        }`}
        title={t("meetings.room.camera")}
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          {cameraEnabled ? (
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
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L5.636 5.636"
            />
          )}
        </svg>
      </button>

      {/* Leave button */}
      <button
        type="button"
        onClick={() => void leave().catch(() => {})}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white transition hover:bg-red-700"
        title={t("coworking.leave")}
      >
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
          />
        </svg>
      </button>
    </div>
  );
}
