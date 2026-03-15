"use client";

import type { AituberSessionDto } from "@echolore/shared/contracts";
import { Room, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useRef } from "react";
import { aituberApi } from "@/lib/api/aituber";
import { useT } from "@/lib/i18n";
import { AituberAvatar } from "./AituberAvatar";
import { AituberChat } from "./AituberChat";
import { useAituberStore } from "./use-aituber-store";

interface AituberStageProps {
  session: AituberSessionDto;
  userName: string;
  livekitUrl: string;
}

const decoder = new TextDecoder();

export function AituberStage({ session, userName, livekitUrl }: AituberStageProps) {
  const t = useT();
  const roomRef = useRef<Room | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const isPlayingRef = useRef(false);

  const connected = useAituberStore((s) => s.connected);
  const avatarState = useAituberStore((s) => s.avatarState);
  const viewerCount = useAituberStore((s) => s.viewerCount);
  const setConnected = useAituberStore((s) => s.setConnected);
  const handleDataEvent = useAituberStore((s) => s.handleDataEvent);
  const reset = useAituberStore((s) => s.reset);
  const ttsAudioQueue = useAituberStore((s) => s.ttsAudioQueue);
  const dequeueTtsAudio = useAituberStore((s) => s.dequeueTtsAudio);

  // Play TTS audio from queue
  const playNextAudio = useCallback(async () => {
    if (isPlayingRef.current) return;

    const item = dequeueTtsAudio();
    if (!item) return;

    isPlayingRef.current = true;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
      }

      const audioData = Uint8Array.from(atob(item.audio), (c) => c.charCodeAt(0));
      const audioBuffer = await audioContextRef.current.decodeAudioData(audioData.buffer);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      if (analyserRef.current) {
        source.connect(analyserRef.current);
        analyserRef.current.connect(audioContextRef.current.destination);
      }

      source.onended = () => {
        isPlayingRef.current = false;
        void playNextAudio();
      };

      source.start();
    } catch (err) {
      console.error("[AituberStage] Audio playback error:", err);
      isPlayingRef.current = false;
    }
  }, [dequeueTtsAudio]);

  useEffect(() => {
    if (ttsAudioQueue.length > 0 && !isPlayingRef.current) {
      void playNextAudio();
    }
  }, [ttsAudioQueue, playNextAudio]);

  // Connect to LiveKit room
  useEffect(() => {
    if (session.status !== "live") return;

    let cancelled = false;

    const connect = async () => {
      try {
        const { token } = await aituberApi.getViewerToken(session.id);
        if (cancelled) return;

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        });

        room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
          try {
            const event = JSON.parse(decoder.decode(payload));
            handleDataEvent(event);
          } catch {
            // Ignore non-JSON data
          }
        });

        room.on(RoomEvent.Disconnected, () => {
          setConnected(false);
        });

        room.on(RoomEvent.Connected, () => {
          setConnected(true);
        });

        await room.connect(livekitUrl, token);
        roomRef.current = room;
      } catch (err) {
        console.error("[AituberStage] Failed to connect:", err);
      }
    };

    void connect();

    return () => {
      cancelled = true;
      roomRef.current?.disconnect();
      roomRef.current = null;
      reset();
    };
  }, [session.id, session.status, livekitUrl, handleDataEvent, setConnected, reset]);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Left: Avatar */}
      <div className="relative h-[40vh] w-full lg:h-full lg:w-2/3">
        <AituberAvatar
          avatarUrl={session.status === "live" ? null /* TODO: get from character */ : null}
          avatarState={avatarState}
          audioAnalyser={analyserRef.current}
        />

        {/* Overlay info */}
        <div className="absolute bottom-3 left-3 flex items-center gap-3">
          {session.status === "live" && (
            <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white animate-pulse">
              LIVE
            </span>
          )}
          {connected && (
            <span className="rounded-full bg-gray-800/80 px-2 py-0.5 text-xs text-gray-300">
              {t("aituber.viewer.viewers", { count: String(viewerCount) })}
            </span>
          )}
        </div>

        {!connected && session.status === "live" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <p className="text-white">{t("aituber.viewer.connecting")}</p>
          </div>
        )}

        {session.status !== "live" && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <p className="text-gray-400">
              {session.status === "created"
                ? t("aituber.sessions.status.created")
                : t("aituber.sessions.status.ended")}
            </p>
          </div>
        )}
      </div>

      {/* Right: Chat */}
      <div className="flex h-[60vh] w-full flex-col border-t border-gray-700 lg:h-full lg:w-1/3 lg:border-l lg:border-t-0">
        <div className="border-b border-gray-700 px-4 py-3">
          <h3 className="text-sm font-medium text-white">{session.title}</h3>
          {session.characterName && (
            <p className="text-xs text-gray-400">{session.characterName}</p>
          )}
        </div>
        <AituberChat sessionId={session.id} userName={userName} />
      </div>
    </div>
  );
}
