"use client";

import {
  AITUBER_VALID_EMOTIONS,
  type AituberAvatarState,
  type AituberCitation,
  type AituberDataEvent,
} from "@echolore/shared/contracts";
import { create } from "zustand";
import type { EmotionState, EmotionType, VisemeEntry } from "./animation/types";

export interface AituberChatMessage {
  id: string;
  role: "viewer" | "assistant";
  senderName: string;
  content: string;
  isStreaming?: boolean;
  createdAt: string;
  /** Set on assistant messages when the response was grounded in RAG sources. */
  citations?: AituberCitation[];
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
  /** Set by the `session-aborted` data event when the server-side AI loop self-terminates. */
  sessionAborted: boolean;
  /**
   * Tools the agent is currently executing, in start order.
   * Empty when the agent isn't calling any tools right now.
   */
  activeToolCalls: string[];

  setConnected: (connected: boolean) => void;
  setAvatarState: (state: AituberAvatarState) => void;
  setAudioSampleRate: (rate: number) => void;
  addViewerMessage: (msg: { id: string; senderName: string; content: string }) => void;
  appendAiToken: (token: string) => void;
  completeAiMessage: (
    messageId: string,
    fullContent: string,
    citations?: AituberCitation[]
  ) => void;
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
  sessionAborted: false,
  activeToolCalls: [],

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

  completeAiMessage: (messageId, fullContent, citations) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: messageId,
          role: "assistant",
          senderName: "AI",
          content: fullContent,
          createdAt: new Date().toISOString(),
          citations: citations && citations.length > 0 ? citations : undefined,
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
      case "ai-complete": {
        const citations = Array.isArray(e.citations)
          ? (e.citations as AituberCitation[])
          : undefined;
        store.completeAiMessage(String(e.messageId ?? ""), String(e.fullContent ?? ""), citations);
        break;
      }
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
        const rawEmotion = String(e.emotion ?? "neutral");
        if (!(AITUBER_VALID_EMOTIONS as readonly string[]).includes(rawEmotion)) break;
        const emotionType = rawEmotion as EmotionType;
        const intensity = Math.min(Math.max(Number(e.intensity ?? 0.5), 0), 1);
        set({ emotion: { type: emotionType, intensity } });
        break;
      }
      case "action":
        set({ pendingAction: String(e.action ?? "") || null });
        break;
      case "session-aborted":
        set({ sessionAborted: true });
        break;
      case "tool-call": {
        const toolName = String(e.toolName ?? "");
        const phase = e.phase === "finished" ? "finished" : "started";
        if (!toolName) break;
        set((s) => {
          if (phase === "started") {
            return { activeToolCalls: [...s.activeToolCalls, toolName] };
          }
          // finished: remove the first matching entry (FIFO so concurrent
          // calls of the same tool clear in order).
          const idx = s.activeToolCalls.indexOf(toolName);
          if (idx < 0) return s;
          const next = s.activeToolCalls.slice();
          next.splice(idx, 1);
          return { activeToolCalls: next };
        });
        break;
      }
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
      sessionAborted: false,
      activeToolCalls: [],
    }),
}));
