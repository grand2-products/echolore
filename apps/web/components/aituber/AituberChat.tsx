"use client";

import { useEffect, useRef, useState } from "react";
import { aituberApi } from "@/lib/api/aituber";
import { useT } from "@/lib/i18n";
import type { AituberChatMessage } from "./use-aituber-store";
import { useAituberStore } from "./use-aituber-store";

interface AituberChatProps {
  sessionId: string;
  userName: string;
}

export function AituberChat({ sessionId, userName }: AituberChatProps) {
  const t = useT();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messages = useAituberStore((s) => s.messages);
  const streamingContent = useAituberStore((s) => s.streamingContent);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  });

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const content = input.trim();
    setInput("");
    setSending(true);
    setError(null);
    try {
      await aituberApi.sendMessage(sessionId, {
        content,
        senderName: userName,
      });
    } catch {
      setError(t("aituber.viewer.sendError"));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg: AituberChatMessage) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
        {streamingContent && (
          <div className="flex gap-2">
            <div className="rounded-lg bg-indigo-900/50 px-3 py-2 text-sm text-indigo-200">
              <span className="mb-1 block text-xs font-medium text-indigo-400">AI</span>
              {streamingContent}
              <span className="ml-1 inline-block animate-pulse">▋</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-700 p-3">
        {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("aituber.viewer.messagePlaceholder")}
            className="flex-1 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-400 focus:border-indigo-500 focus:outline-none"
            disabled={sending}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !input.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {t("aituber.viewer.send")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: AituberChatMessage }) {
  const isAi = message.role === "assistant";

  return (
    <div className={`flex gap-2 ${isAi ? "" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
          isAi ? "bg-indigo-900/50 text-indigo-200" : "bg-gray-700 text-gray-200"
        }`}
      >
        <span
          className={`mb-1 block text-xs font-medium ${isAi ? "text-indigo-400" : "text-gray-400"}`}
        >
          {message.senderName}
        </span>
        {message.content}
      </div>
    </div>
  );
}
