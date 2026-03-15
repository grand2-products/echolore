"use client";

import { useDataChannel } from "@livekit/components-react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface ActiveReaction {
  id: string;
  emoji: string;
  x: number; // 5-95, random horizontal %
  createdAt: number; // Date.now() when added
}

interface ReactionMessage {
  id: string;
  emoji: string;
  senderName: string;
  ts: number;
}

const REACTION_EMOJIS = [
  { emoji: "\u{1F44D}", label: "thumbsUp" },
  { emoji: "\u{1F44F}", label: "clap" },
  { emoji: "\u2764\uFE0F", label: "heart" },
  { emoji: "\u{1F602}", label: "laugh" },
  { emoji: "\u{1F389}", label: "celebrate" },
  { emoji: "\u{1F914}", label: "thinking" },
  { emoji: "\u{1F440}", label: "eyes" },
  { emoji: "\u{1F525}", label: "fire" },
] as const;

export { REACTION_EMOJIS };

function randomX() {
  return 5 + Math.random() * 90;
}

export function useReactions(senderName: string) {
  const [reactions, setReactions] = useState<ActiveReaction[]>([]);
  const encoderRef = useRef(new TextEncoder());
  const decoderRef = useRef(new TextDecoder());
  const lastSendRef = useRef(0);

  const onMessage = useCallback((msg: { payload: Uint8Array }) => {
    try {
      const parsed: ReactionMessage = JSON.parse(decoderRef.current.decode(msg.payload));
      setReactions((prev) => [
        ...prev,
        { id: parsed.id, emoji: parsed.emoji, x: randomX(), createdAt: Date.now() },
      ]);
    } catch {
      // ignore malformed messages
    }
  }, []);

  const { send } = useDataChannel("reaction", onMessage);

  const sendReaction = useCallback(
    (emoji: string) => {
      // Rate limit: max 1 reaction per 300ms
      const now = Date.now();
      if (now - lastSendRef.current < 300) return;
      lastSendRef.current = now;

      const msg: ReactionMessage = {
        id: crypto.randomUUID(),
        emoji,
        senderName,
        ts: now,
      };
      const payload = encoderRef.current.encode(JSON.stringify(msg));
      void send(payload, { reliable: false });
      // Show locally immediately (onMessage only fires for remote)
      setReactions((prev) => [
        ...prev,
        { id: msg.id, emoji: msg.emoji, x: randomX(), createdAt: now },
      ]);
    },
    [send, senderName]
  );

  const removeReaction = useCallback((id: string) => {
    setReactions((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // Safety cleanup: remove reactions older than 4 seconds (timestamp-based)
  const hasReactions = reactions.length > 0;
  useEffect(() => {
    if (!hasReactions) return;
    const timer = setInterval(() => {
      const cutoff = Date.now() - 4000;
      setReactions((prev) => {
        const filtered = prev.filter((r) => r.createdAt > cutoff);
        return filtered.length === prev.length ? prev : filtered;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [hasReactions]);

  return { reactions, sendReaction, removeReaction };
}
