"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useChatSidebar } from "@/components/ai-chat/chat-sidebar-context";
import { useCreateAiChatConversationMutation } from "@/lib/api";
import { useT } from "@/lib/i18n";

const LAST_CHAT_KEY = "echolore:lastChatId";

export default function AiChatEmptyPage() {
  const t = useT();
  const router = useRouter();
  const createMutation = useCreateAiChatConversationMutation();
  const { setIsMobileOpen } = useChatSidebar();

  // Resume last conversation
  useEffect(() => {
    const lastId = localStorage.getItem(LAST_CHAT_KEY);
    if (lastId) {
      router.replace(`/ai-chat/${lastId}`);
    }
  }, [router]);

  const handleNewChat = async () => {
    const result = await createMutation.mutateAsync({});
    if (result.conversation) {
      router.push(`/ai-chat/${result.conversation.id}`);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8">
      {/* Mobile sidebar toggle */}
      <button
        type="button"
        onClick={() => setIsMobileOpen(true)}
        className="absolute left-3 top-3 rounded-lg p-2 text-gray-500 hover:bg-gray-200 md:hidden"
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

      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
        <svg
          className="h-8 w-8 text-blue-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-gray-900">{t("aiChat.emptyState.title")}</h2>
      <p className="mt-2 max-w-md text-center text-sm text-gray-500">
        {t("aiChat.emptyState.description")}
      </p>
      <button
        type="button"
        onClick={() => void handleNewChat()}
        disabled={createMutation.isPending}
        className="mt-6 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {t("aiChat.sidebar.newChat")}
      </button>
    </div>
  );
}
