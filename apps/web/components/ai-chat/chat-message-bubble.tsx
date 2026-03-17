"use client";

import Link from "next/link";
import type { AiChatMessage } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { MarkdownContent } from "./markdown-content";

/** Shared shape accepted by both chat variants. */
export interface ChatBubbleMessage {
  id: string;
  role: string;
  content: string;
  senderName?: string;
  citations?: AiChatMessage["citations"];
}

interface ChatMessageBubbleProps {
  message: ChatBubbleMessage;
  /**
   * - `"default"` – white/blue bubbles used in the floating AI chat
   * - `"aituber"` – dark indigo/gray bubbles used in the AituberChat panel
   */
  variant?: "default" | "aituber";
}

export function ChatMessageBubble({ message, variant = "default" }: ChatMessageBubbleProps) {
  const t = useT();
  const isUser = message.role === "user" || message.role === "viewer";

  if (variant === "aituber") {
    return (
      <div className={`flex gap-2 ${isUser ? "justify-end" : ""}`}>
        <div
          className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
            isUser ? "bg-gray-700 text-gray-200" : "bg-indigo-900/50 text-indigo-200"
          }`}
        >
          <span
            className={`mb-1 block text-xs font-medium ${isUser ? "text-gray-400" : "text-indigo-400"}`}
          >
            {message.senderName}
          </span>
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0">
            <MarkdownContent content={message.content} />
          </div>
        )}

        {message.citations && message.citations.length > 0 ? (
          <CitationChips citations={message.citations} label={t("aiChat.citationLabel")} />
        ) : null}
      </div>
    </div>
  );
}

function CitationChips({
  citations,
  label,
}: {
  citations: NonNullable<AiChatMessage["citations"]>;
  label: string;
}) {
  return (
    <div className="mt-2 border-t border-gray-200 pt-2">
      <p className="mb-1 text-xs font-medium text-gray-500">{label}</p>
      <div className="flex flex-wrap gap-1">
        {citations.map((citation) => (
          <Link
            key={citation.pageId}
            href={`/wiki/${citation.pageId}`}
            className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-100"
          >
            <svg
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {citation.pageTitle}
          </Link>
        ))}
      </div>
    </div>
  );
}
