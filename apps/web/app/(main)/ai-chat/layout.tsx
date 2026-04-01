"use client";

import { useParams } from "next/navigation";
import { ChatSidebar } from "@/components/ai-chat/chat-sidebar";
import { ChatSidebarProvider } from "@/components/ai-chat/chat-sidebar-context";

export default function AiChatLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const activeId = typeof params.id === "string" ? params.id : undefined;

  return (
    <ChatSidebarProvider>
      <div className="flex h-full flex-col md:flex-row">
        <ChatSidebar activeId={activeId} />
        {children}
      </div>
    </ChatSidebarProvider>
  );
}
