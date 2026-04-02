"use client";

import type { AituberSessionDto } from "@echolore/shared/contracts";
import { Room, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useRef } from "react";
import { aituberApi } from "@/lib/api/aituber";
import {
  type AudioNodes,
  decodeBase64Audio,
  ensureAudioNodes,
  playAudioBuffer,
} from "@/lib/audio-utils";
import { useT } from "@/lib/i18n";
import { AituberAvatar } from "./AituberAvatar";
import { AituberChat } from "./AituberChat";
import { useAituberStore } from "./use-aituber-store";

interface AituberStageProps {
  session: AituberSessionDto;
  livekitUrl: string;
}

const decoder = new TextDecoder();

export function AituberStage({ session, livekitUrl }: AituberStageProps) {
  const t = useT();
  const roomRef = useRef<Room | null>(null);
  const audioNodesRef = useRef<AudioNodes | null>(null);
  const isPlayingRef = useRef(false);

  const connected = useAituberStore((s) => s.connected);
  const viewerCount = useAituberStore((s) => s.viewerCount);
  const setConnected = useAituberStore((s) => s.setConnected);
  const setAudioSampleRate = useAituberStore((s) => s.setAudioSampleRate);
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
      const nodes = ensureAudioNodes(audioNodesRef.current);
      audioNodesRef.current = nodes;
      setAudioSampleRate(nodes.context.sampleRate);

      const audioBuffer = await decodeBase64Audio(nodes.context, item.audio);
      const source = playAudioBuffer(nodes, audioBuffer);

      source.onended = () => {
        isPlayingRef.current = false;
        void playNextAudio();
      };
    } catch (err) {
      console.error("[AituberStage] Audio playback error:", err);
      isPlayingRef.current = false;
    }
  }, [dequeueTtsAudio, setAudioSampleRate]);

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
    <div className="flex h-full flex-col bg-gray-950 lg:flex-row">
      {/* Left: Avatar */}
      <div className="relative h-[40vh] w-full lg:h-full lg:w-2/3">
        <AituberAvatar avatarUrl={session.characterAvatarUrl ?? null} />

        {/* Overlay info */}
        <div className="absolute bottom-4 left-4 flex items-center gap-2">
          {session.status === "live" && (
            <span className="rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-bold text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.4)] backdrop-blur-sm">
              LIVE
            </span>
          )}
          {connected && (
            <span className="rounded-full bg-black/40 px-2.5 py-0.5 text-xs text-gray-300 backdrop-blur-sm">
              {t("aituber.viewer.viewers", { count: String(viewerCount) })}
            </span>
          )}
        </div>

        {!connected && session.status === "live" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-500 border-t-indigo-400" />
              <p className="text-sm text-gray-300">{t("aituber.viewer.connecting")}</p>
            </div>
          </div>
        )}

        {session.status !== "live" && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-950">
            <p className="text-gray-500">
              {session.status === "created"
                ? t("aituber.sessions.status.created")
                : t("aituber.sessions.status.ended")}
            </p>
          </div>
        )}
      </div>

      {/* Right: Chat */}
      <div className="flex h-[60vh] w-full flex-col border-t border-white/10 bg-gray-900/50 lg:h-full lg:w-1/3 lg:border-l lg:border-t-0">
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-medium text-gray-200">{session.title}</h3>
          {session.characterName && (
            <p className="text-xs text-gray-500">{session.characterName}</p>
          )}
        </div>
        <AituberChat sessionId={session.id} />
      </div>
    </div>
  );
}
