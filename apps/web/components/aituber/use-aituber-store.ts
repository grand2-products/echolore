"use client";

import type { AituberAvatarState, AituberDataEvent } from "@echolore/shared/contracts";
import { create } from "zustand";

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
  messages: AituberChatMessage[];
  streamingContent: string;
  viewerCount: number;
  ttsAudioQueue: Array<{ audio: string; mimeType: string }>;

  setConnected: (connected: boolean) => void;
  setAvatarState: (state: AituberAvatarState) => void;
  addViewerMessage: (msg: { id: string; senderName: string; content: string }) => void;
  appendAiToken: (token: string) => void;
  completeAiMessage: (messageId: string, fullContent: string) => void;
  setViewerCount: (count: number) => void;
  enqueueTtsAudio: (audio: string, mimeType: string) => void;
  dequeueTtsAudio: () => { audio: string; mimeType: string } | undefined;
  handleDataEvent: (event: AituberDataEvent | Record<string, unknown>) => void;
  reset: () => void;
}

export const useAituberStore = create<AituberStoreState>((set, get) => ({
  connected: false,
  avatarState: "idle",
  messages: [],
  streamingContent: "",
  viewerCount: 0,
  ttsAudioQueue: [],

  setConnected: (connected) => set({ connected }),
  setAvatarState: (avatarState) => set({ avatarState }),

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

  enqueueTtsAudio: (audio, mimeType) =>
    set((s) => ({
      ttsAudioQueue: [...s.ttsAudioQueue, { audio, mimeType }],
    })),

  dequeueTtsAudio: () => {
    const queue = get().ttsAudioQueue;
    if (queue.length === 0) return undefined;
    const [first, ...rest] = queue;
    set({ ttsAudioQueue: rest });
    return first;
  },

  handleDataEvent: (event) => {
    const store = get();
    const e = event as Record<string, string | number | undefined>;
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
      case "tts-audio":
        store.enqueueTtsAudio(String(e.audio ?? ""), String(e.mimeType ?? ""));
        break;
    }
  },

  reset: () =>
    set({
      connected: false,
      avatarState: "idle",
      messages: [],
      streamingContent: "",
      viewerCount: 0,
      ttsAudioQueue: [],
    }),
}));
