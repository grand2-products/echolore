"use client";

import { ChatInput, ChatMessageBubble, TypingIndicator } from "@/components/ai-chat";
import {
  type AiChatMessage,
  aiChatApi,
  useAiChatConversationQuery,
  useSendAiChatMessageMutation,
} from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useScrollIntoView } from "@/lib/hooks/use-auto-scroll";
import { useT } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef } from "react";

export default function AiChatPage() {
  const params = useParams();
  const router = useRouter();
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const id = params.id as string;

  const { data, isLoading, error } = useAiChatConversationQuery(id);
  const sendMutation = useSendAiChatMessageMutation(id);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversation = data?.conversation;
  const messages: AiChatMessage[] = data?.messages ?? [];

  useScrollIntoView(messagesEndRef, messages.length);

  const handleSend = (content: string) => {
    sendMutation.mutate(content);
  };

  const handleDelete = async () => {
    if (!confirm(t("aiChat.deleteConfirm"))) return;
    try {
      await aiChatApi.deleteConversation(id);
      void queryClient.invalidateQueries({ queryKey: ["ai-chat", "conversations"] });
      router.push("/ai-chat");
    } catch {
      // Ignore
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">{t("aiChat.loading")}</p>
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-gray-500">
          {error ? getApiErrorMessage(error, t("aiChat.notFound")) : t("aiChat.notFound")}
        </p>
        <Link
          href="/ai-chat"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          {t("aiChat.back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-3">
        <Link
          href="/ai-chat"
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
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
          {t(`aiChat.${conversation.visibility}`)}
        </span>
        <button
          type="button"
          onClick={handleDelete}
          className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
          title="Delete"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
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
