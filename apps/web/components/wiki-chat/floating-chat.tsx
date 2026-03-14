"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { wikiChatApi, type WikiChatMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { ChatMessageBubble } from "./chat-message-bubble";
import { TypingIndicator } from "./typing-indicator";

export function FloatingChat() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<WikiChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isPending]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || isPending) return;

    setInput("");
    setError(null);
    setIsPending(true);

    const optimisticMessage: WikiChatMessage = {
      id: `optimistic-${crypto.randomUUID()}`,
      conversationId: conversationId ?? "",
      role: "user",
      content,
      citations: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      let activeConversationId = conversationId;

      if (!activeConversationId) {
        const res = await wikiChatApi.createConversation({ visibility: "private" });
        activeConversationId = res.conversation.id;
        setConversationId(activeConversationId);
      }

      const res = await wikiChatApi.sendMessage(activeConversationId, content);
      setMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== optimisticMessage.id);
        return [...withoutOptimistic, res.userMessage, res.assistantMessage];
      });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id));
      setInput(content);
      setError(t("floatingChat.error"));
    } finally {
      setIsPending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setError(null);
  };

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-transform hover:bg-blue-700 hover:scale-105 active:scale-95"
        aria-label={t("floatingChat.toggle")}
      >
        {open ? (
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[500px] w-[380px] flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-gray-900">{t("floatingChat.title")}</h3>
            <div className="flex items-center gap-1">
              {conversationId && (
                <>
                  <Link
                    href={`/wiki-chat/${conversationId}`}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    title={t("floatingChat.openFull")}
                    onClick={() => setOpen(false)}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </Link>
                  <button
                    type="button"
                    onClick={handleNewChat}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    title={t("floatingChat.newChat")}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && !isPending && (
              <p className="pt-8 text-center text-sm text-gray-400">
                {t("floatingChat.empty")}
              </p>
            )}
            {messages.map((msg) => (
              <ChatMessageBubble key={msg.id} message={msg} />
            ))}
            {isPending && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 px-3 py-3">
            {error && (
              <p className="mb-2 text-xs text-red-600">{error}</p>
            )}
            <div className="flex gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("floatingChat.placeholder")}
                rows={1}
                disabled={isPending}
                className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!input.trim() || isPending}
                className="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
