"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useWikiChatConversationQuery,
  useSendWikiChatMessageMutation,
  wikiChatApi,
  type WikiChatMessage,
} from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { ChatMessageBubble, ChatInput, TypingIndicator } from "@/components/wiki-chat";

export default function WikiChatPage() {
  const params = useParams();
  const router = useRouter();
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const id = params.id as string;

  const { data, isLoading, error } = useWikiChatConversationQuery(id);
  const sendMutation = useSendWikiChatMessageMutation(id);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversation = data?.conversation;
  const messages: WikiChatMessage[] = data?.messages ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = (content: string) => {
    sendMutation.mutate(content);
  };

  const handleDelete = async () => {
    if (!confirm(t("wikiChat.deleteConfirm"))) return;
    try {
      await wikiChatApi.deleteConversation(id);
      void queryClient.invalidateQueries({ queryKey: ["wiki-chat", "conversations"] });
      router.push("/wiki-chat");
    } catch {
      // Ignore
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">{t("wikiChat.loading")}</p>
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-gray-500">
          {error ? getApiErrorMessage(error, t("wikiChat.notFound")) : t("wikiChat.notFound")}
        </p>
        <Link
          href="/wiki-chat"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          {t("wikiChat.back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-3">
        <Link
          href="/wiki-chat"
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="flex-1 truncate text-lg font-semibold text-gray-900">
          {conversation.title}
        </h1>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            conversation.visibility === "private"
              ? "bg-gray-100 text-gray-600"
              : "bg-blue-50 text-blue-600"
          }`}
        >
          {t(`wikiChat.${conversation.visibility}`)}
        </span>
        <button
          type="button"
          onClick={handleDelete}
          className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
          title="Delete"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.map((msg) => (
            <ChatMessageBubble key={msg.id} message={msg} />
          ))}
          {sendMutation.isPending ? <TypingIndicator /> : null}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        isPending={sendMutation.isPending}
        error={sendMutation.error}
        errorMessage={
          sendMutation.error
            ? getApiErrorMessage(sendMutation.error, "Failed to send message")
            : undefined
        }
      />
    </div>
  );
}
