"use client";

import { ErrorBanner, LoadingState } from "@/components/ui";
import {
  type AiChatConversation,
  useAiChatConversationsQuery,
  useCreateAiChatConversationMutation,
} from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useFormatters, useT } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AiChatListPage() {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const { dateTime } = useFormatters();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"all" | "my">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error } = useAiChatConversationsQuery({
    mine: tab === "my",
    query: searchQuery || undefined,
  });

  const createMutation = useCreateAiChatConversationMutation();

  const conversations: AiChatConversation[] = data?.conversations ?? [];

  const handleNewChat = async () => {
    try {
      const result = await createMutation.mutateAsync({});
      if (result.conversation) {
        router.push(`/ai-chat/${result.conversation.id}`);
      }
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="flex-1 p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t("aiChat.title")}</h1>
            <p className="mt-1 text-gray-600">{t("aiChat.description")}</p>
          </div>
          <button
            type="button"
            onClick={handleNewChat}
            disabled={createMutation.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {t("aiChat.newChat")}
          </button>
        </div>

        {/* Search and tabs */}
        <div className="mb-6 space-y-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("aiChat.searchPlaceholder")}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("all")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === "all" ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t("aiChat.allTab")}
            </button>
            <button
              type="button"
              onClick={() => setTab("my")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === "my" ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t("aiChat.myTab")}
            </button>
          </div>
        </div>

        {/* Conversation list */}
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorBanner
            message={getApiErrorMessage(error, t("aiChat.loadError"))}
            onRetry={() =>
              void queryClient.invalidateQueries({ queryKey: ["ai-chat", "conversations"] })
            }
          />
        ) : conversations.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-500">{t("aiChat.noConversations")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => (
              <Link
                key={conv.id}
                href={`/ai-chat/${conv.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium text-gray-900">{conv.title}</h3>
                    {conv.lastMessagePreview ? (
                      <p className="mt-1 truncate text-sm text-gray-500">
                        {conv.lastMessagePreview}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                      {conv.creatorName ? (
                        <span>{t("aiChat.createdBy", { name: conv.creatorName })}</span>
                      ) : null}
                      <span>{dateTime(new Date(conv.updatedAt))}</span>
                      {conv.messageCount != null ? <span>{conv.messageCount} messages</span> : null}
                    </div>
                  </div>
                  <span
                    className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      conv.visibility === "private"
                        ? "bg-gray-100 text-gray-600"
                        : "bg-blue-50 text-blue-600"
                    }`}
                  >
                    {t(`aiChat.${conv.visibility}`)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
