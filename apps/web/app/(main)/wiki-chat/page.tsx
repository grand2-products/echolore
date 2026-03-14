"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useWikiChatConversationsQuery,
  useCreateWikiChatConversationMutation,
  type WikiChatConversation,
} from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useFormatters, useT } from "@/lib/i18n";
import { useQueryClient } from "@tanstack/react-query";

export default function WikiChatListPage() {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const { dateTime } = useFormatters();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"all" | "my">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error } = useWikiChatConversationsQuery({
    mine: tab === "my",
    query: searchQuery || undefined,
  });

  const createMutation = useCreateWikiChatConversationMutation();

  const conversations: WikiChatConversation[] = data?.conversations ?? [];

  const handleNewChat = async () => {
    try {
      const result = await createMutation.mutateAsync({});
      if (result.conversation) {
        router.push(`/wiki-chat/${result.conversation.id}`);
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
            <h1 className="text-3xl font-bold text-gray-900">{t("wikiChat.title")}</h1>
            <p className="mt-1 text-gray-600">{t("wikiChat.description")}</p>
          </div>
          <button
            type="button"
            onClick={handleNewChat}
            disabled={createMutation.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {t("wikiChat.newChat")}
          </button>
        </div>

        {/* Search and tabs */}
        <div className="mb-6 space-y-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("wikiChat.searchPlaceholder")}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("all")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === "all"
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t("wikiChat.allTab")}
            </button>
            <button
              type="button"
              onClick={() => setTab("my")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === "my"
                  ? "bg-blue-100 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t("wikiChat.myTab")}
            </button>
          </div>
        </div>

        {/* Conversation list */}
        {isLoading ? (
          <p className="text-sm text-gray-500">{t("common.status.loading")}</p>
        ) : error ? (
          <div className="space-y-3">
            <p className="text-sm text-red-600">
              {getApiErrorMessage(error, t("wikiChat.loadError"))}
            </p>
            <button
              type="button"
              onClick={() =>
                void queryClient.invalidateQueries({ queryKey: ["wiki-chat", "conversations"] })
              }
              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50"
            >
              {t("common.actions.retry")}
            </button>
          </div>
        ) : conversations.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-500">{t("wikiChat.noConversations")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => (
              <Link
                key={conv.id}
                href={`/wiki-chat/${conv.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-blue-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium text-gray-900">
                      {conv.title}
                    </h3>
                    {conv.lastMessagePreview ? (
                      <p className="mt-1 truncate text-sm text-gray-500">
                        {conv.lastMessagePreview}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                      {conv.creatorName ? (
                        <span>{t("wikiChat.createdBy", { name: conv.creatorName })}</span>
                      ) : null}
                      <span>{dateTime(new Date(conv.updatedAt))}</span>
                      {conv.messageCount != null ? (
                        <span>{conv.messageCount} messages</span>
                      ) : null}
                    </div>
                  </div>
                  <span
                    className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      conv.visibility === "private"
                        ? "bg-gray-100 text-gray-600"
                        : "bg-blue-50 text-blue-600"
                    }`}
                  >
                    {t(`wikiChat.${conv.visibility}`)}
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
