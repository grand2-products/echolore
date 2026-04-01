"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AiChatConversation } from "@/lib/api";
import {
  useAiChatConversationsQuery,
  useCreateAiChatConversationMutation,
  useDeleteAiChatConversationMutation,
} from "@/lib/api/hooks";
import { useT } from "@/lib/i18n";
import { useChatSidebar } from "./chat-sidebar-context";

interface ChatSidebarProps {
  activeId?: string;
}

interface ConversationGroup {
  label: string;
  conversations: AiChatConversation[];
}

function groupByTime(
  conversations: AiChatConversation[],
  t: (key: string) => string
): ConversationGroup[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
  const week = new Date(todayStart.getTime() - 7 * 86_400_000);
  const month = new Date(todayStart.getTime() - 30 * 86_400_000);

  const today: AiChatConversation[] = [];
  const yesterday: AiChatConversation[] = [];
  const prevWeek: AiChatConversation[] = [];
  const prevMonth: AiChatConversation[] = [];
  const older: AiChatConversation[] = [];

  for (const conv of conversations) {
    const d = new Date(conv.updatedAt);
    if (d >= todayStart) today.push(conv);
    else if (d >= yesterdayStart) yesterday.push(conv);
    else if (d >= week) prevWeek.push(conv);
    else if (d >= month) prevMonth.push(conv);
    else older.push(conv);
  }

  const groups: ConversationGroup[] = [];
  if (today.length) groups.push({ label: t("aiChat.sidebar.today"), conversations: today });
  if (yesterday.length)
    groups.push({ label: t("aiChat.sidebar.yesterday"), conversations: yesterday });
  if (prevWeek.length)
    groups.push({ label: t("aiChat.sidebar.previous7Days"), conversations: prevWeek });
  if (prevMonth.length)
    groups.push({ label: t("aiChat.sidebar.previous30Days"), conversations: prevMonth });
  if (older.length) groups.push({ label: t("aiChat.sidebar.older"), conversations: older });
  return groups;
}

export function ChatSidebar({ activeId }: ChatSidebarProps) {
  const t = useT();
  const router = useRouter();
  const { isMobileOpen, setIsMobileOpen } = useChatSidebar();
  const { data } = useAiChatConversationsQuery();
  const createMutation = useCreateAiChatConversationMutation();
  const deleteMutation = useDeleteAiChatConversationMutation();

  const conversations = data?.conversations ?? [];
  const groups = groupByTime(conversations, t);

  const handleNewChat = async () => {
    const result = await createMutation.mutateAsync({});
    if (result.conversation) {
      router.push(`/ai-chat/${result.conversation.id}`);
      setIsMobileOpen(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await deleteMutation.mutateAsync(id);
    if (activeId === id) {
      localStorage.removeItem("echolore:lastChatId");
      router.push("/ai-chat");
    }
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-gray-900">
      <div className="p-3">
        <button
          type="button"
          onClick={() => void handleNewChat()}
          disabled={createMutation.isPending}
          className="flex w-full items-center gap-2 rounded-lg border border-gray-700 px-3 py-2.5 text-sm font-medium text-gray-200 hover:bg-gray-800 disabled:opacity-50"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t("aiChat.sidebar.newChat")}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {groups.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-gray-500">
            {t("aiChat.sidebar.noConversations")}
          </p>
        )}
        {groups.map((group) => (
          <div key={group.label}>
            <h3 className="mt-4 px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
              {group.label}
            </h3>
            {group.conversations.map((conv) => (
              <Link
                key={conv.id}
                href={`/ai-chat/${conv.id}`}
                onClick={() => setIsMobileOpen(false)}
                className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  activeId === conv.id
                    ? "bg-gray-700 text-white"
                    : "text-gray-300 hover:bg-gray-800"
                }`}
              >
                <span className="flex-1 truncate">
                  {conv.title || t("aiChat.sidebar.untitled")}
                </span>
                <button
                  type="button"
                  onClick={(e) => void handleDelete(conv.id, e)}
                  className="hidden shrink-0 rounded p-0.5 text-gray-500 hover:text-red-400 group-hover:block"
                  title={t("aiChat.sidebar.deleteTooltip")}
                >
                  <svg
                    className="h-3.5 w-3.5"
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
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 md:block">{sidebarContent}</aside>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss */}
          <div
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={() => setIsMobileOpen(false)}
            role="presentation"
          />
          <aside className="fixed inset-y-0 left-0 z-40 w-72 md:hidden">{sidebarContent}</aside>
        </>
      )}
    </>
  );
}
