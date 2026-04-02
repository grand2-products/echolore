"use client";

import { useRef, useState } from "react";
import { ChatMessageBubble } from "@/components/ai-chat/chat-message-bubble";
import { aituberApi } from "@/lib/api/aituber";
import { useScrollIntoView } from "@/lib/hooks/use-auto-scroll";
import { useEnterToSend } from "@/lib/hooks/use-enter-to-send";
import { useT } from "@/lib/i18n";
import type { AituberChatMessage } from "./use-aituber-store";
import { useAituberStore } from "./use-aituber-store";

interface AituberChatProps {
  sessionId: string;
}

export function AituberChat({ sessionId }: AituberChatProps) {
  const t = useT();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messages = useAituberStore((s) => s.messages);
  const streamingContent = useAituberStore((s) => s.streamingContent);

  // タスク3: 既存の useScrollIntoView フックで自動スクロールを統一
  useScrollIntoView(messagesEndRef, `${messages.length}-${streamingContent}`);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);
    setError(null);
    try {
      await aituberApi.sendMessage(sessionId, { content });
    } catch {
      setError(t("aituber.viewer.sendError"));
    } finally {
      setSending(false);
    }
  };

  // タスク1: 共通フックで Enter キーハンドラを共用化
  const handleKeyDown = useEnterToSend(() => void handleSend());

  return (
    <div className="flex h-full flex-col bg-gray-950/50">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg: AituberChatMessage) => (
          <ChatMessageBubble key={msg.id} message={msg} variant="aituber" />
        ))}
        {streamingContent && (
          <div className="flex gap-2">
            <div className="max-w-[80%] rounded-xl bg-indigo-500/15 px-3.5 py-2.5 text-sm text-indigo-200">
              <span className="mb-1 block text-xs font-medium text-indigo-400">AI</span>
              {streamingContent}
              <span className="ml-1 inline-block animate-pulse text-indigo-400">▋</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/10 p-3">
        {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("aituber.viewer.messagePlaceholder")}
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
            disabled={sending}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !input.trim()}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
          >
            {t("aituber.viewer.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
