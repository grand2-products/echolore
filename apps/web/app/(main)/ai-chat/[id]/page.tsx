"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChatInput, ChatMessageBubble, TypingIndicator } from "@/components/ai-chat";
import { useChatSidebar } from "@/components/ai-chat/chat-sidebar-context";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  type AiChatMessage,
  useAiChatConversationQuery,
  useDeleteAiChatConversationMutation,
  useSendAiChatMessageMutation,
} from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useScrollIntoView } from "@/lib/hooks/use-auto-scroll";
import { useT } from "@/lib/i18n";

export default function AiChatPage() {
  const params = useParams();
  const router = useRouter();
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const id = params.id as string;
  const { setIsMobileOpen } = useChatSidebar();

  // Persist last opened conversation for resume
  useEffect(() => {
    localStorage.setItem("echolore:lastChatId", id);
  }, [id]);

  const { data, isLoading, error } = useAiChatConversationQuery(id);
  const sendMutation = useSendAiChatMessageMutation(id);
  const deleteMutation = useDeleteAiChatConversationMutation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const conversation = data?.conversation;
  const messages: AiChatMessage[] = data?.messages ?? [];

  useScrollIntoView(messagesEndRef, messages.length);

  const handleSend = (content: string) => {
    sendMutation.mutate(content);
  };

  const handleDeleteConfirmed = async () => {
    setShowDeleteConfirm(false);
    localStorage.removeItem("echolore:lastChatId");
    await deleteMutation.mutateAsync(id);
    router.push("/ai-chat");
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-gray-500">{t("aiChat.loading")}</p>
      </div>
    );
  }

  if (error || !conversation) {
    // Clear stale ID to prevent redirect loop from /ai-chat
    if (typeof window !== "undefined") localStorage.removeItem("echolore:lastChatId");
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
      <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
        <button
          type="button"
          onClick={() => setIsMobileOpen(true)}
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 md:hidden"
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
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
        <h1 className="flex-1 truncate text-lg font-semibold text-gray-900">
          {conversation.title}
        </h1>
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
          title={t("aiChat.sidebar.deleteTooltip")}
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
      <div className="flex-1 overflow-y-auto px-4 py-4">
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
      <ConfirmDialog
        open={showDeleteConfirm}
        title={t("aiChat.deleteConfirm")}
        variant="danger"
        onConfirm={() => void handleDeleteConfirmed()}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
