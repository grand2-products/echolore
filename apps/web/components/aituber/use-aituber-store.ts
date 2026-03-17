"use client";

import type { AituberAvatarState, AituberDataEvent } from "@echolore/shared/contracts";
import { create } from "zustand";
import type { EmotionState, EmotionType, VisemeEntry } from "./animation/types";

export interface AituberChatMessage {
  id: string;
  role: "viewer" | "assistant";
  senderName: string;
  content: string;
  isStreaming?: boolean;
  createdAt: string;
}

interface AituberStoreState {
  connected: boolean;
  avatarState: AituberAvatarState;
  emotion: EmotionState | null;
  pendingAction: string | null;
  currentVisemes: VisemeEntry[] | null;
  audioSampleRate: number;
  messages: AituberChatMessage[];
  streamingContent: string;
  viewerCount: number;
  ttsAudioQueue: Array<{ audio: string; mimeType: string; visemes?: VisemeEntry[] }>;

  setConnected: (connected: boolean) => void;
  setAvatarState: (state: AituberAvatarState) => void;
  setAudioSampleRate: (rate: number) => void;
  addViewerMessage: (msg: { id: string; senderName: string; content: string }) => void;
  appendAiToken: (token: string) => void;
  completeAiMessage: (messageId: string, fullContent: string) => void;
  setViewerCount: (count: number) => void;
  enqueueTtsAudio: (audio: string, mimeType: string, visemes?: VisemeEntry[]) => void;
  dequeueTtsAudio: () => { audio: string; mimeType: string; visemes?: VisemeEntry[] } | undefined;
  handleDataEvent: (event: AituberDataEvent | Record<string, unknown>) => void;
  reset: () => void;
}

export const useAituberStore = create<AituberStoreState>((set, get) => ({
  connected: false,
  avatarState: "idle",
  emotion: null,
  pendingAction: null,
  currentVisemes: null,
  audioSampleRate: 48000,
  messages: [],
  streamingContent: "",
  viewerCount: 0,
  ttsAudioQueue: [],

  setConnected: (connected) => set({ connected }),
  setAvatarState: (avatarState) => set({ avatarState }),
  setAudioSampleRate: (audioSampleRate) => set({ audioSampleRate }),

  addViewerMessage: (msg) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: msg.id,
          role: "viewer",
          senderName: msg.senderName,
          content: msg.content,
          createdAt: new Date().toISOString(),
        },
      ],
    })),

  appendAiToken: (token) => set((s) => ({ streamingContent: s.streamingContent + token })),

  completeAiMessage: (messageId, fullContent) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: messageId,
          role: "assistant",
          senderName: "AI",
          content: fullContent,
          createdAt: new Date().toISOString(),
        },
      ],
      streamingContent: "",
    })),

  setViewerCount: (viewerCount) => set({ viewerCount }),

  enqueueTtsAudio: (audio, mimeType, visemes) =>
    set((s) => ({
      ttsAudioQueue: [...s.ttsAudioQueue, { audio, mimeType, visemes }],
    })),

  dequeueTtsAudio: () => {
    const queue = get().ttsAudioQueue;
    if (queue.length === 0) return undefined;
    const [first, ...rest] = queue;
    set({ ttsAudioQueue: rest, currentVisemes: first?.visemes ?? null });
    return first;
  },

  handleDataEvent: (event) => {
    const store = get();
    const e = event as Record<string, unknown>;
    const type = e.type as string;

    switch (type) {
      case "viewer-message":
        store.addViewerMessage({
          id: String(e.messageId ?? ""),
          senderName: String(e.senderName ?? ""),
          content: String(e.content ?? ""),
        });
        break;
      case "ai-token":
        store.appendAiToken(String(e.token ?? ""));
        break;
      case "ai-complete":
        store.completeAiMessage(String(e.messageId ?? ""), String(e.fullContent ?? ""));
        break;
      case "avatar-state":
        set({ avatarState: String(e.state ?? "idle") as AituberAvatarState });
        break;
      case "viewer-count":
        set({ viewerCount: Number(e.count ?? 0) });
        break;
      case "tts-audio": {
        const visemes = Array.isArray(e.visemes) ? (e.visemes as VisemeEntry[]) : undefined;
        store.enqueueTtsAudio(String(e.audio ?? ""), String(e.mimeType ?? ""), visemes);
        break;
      }
      case "emotion": {
        const emotionType = String(e.emotion ?? "neutral") as EmotionType;
        const intensity = Math.min(Math.max(Number(e.intensity ?? 0.5), 0), 1);
        set({ emotion: { type: emotionType, intensity } });
        break;
      }
      case "action":
        set({ pendingAction: String(e.action ?? "") || null });
        break;
    }
  },

  reset: () =>
    set({
      connected: false,
      avatarState: "idle",
      emotion: null,
      pendingAction: null,
      currentVisemes: null,
      messages: [],
      streamingContent: "",
      viewerCount: 0,
      ttsAudioQueue: [],
    }),
}));
