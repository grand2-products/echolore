"use client";

import Link from "next/link";
import { useState } from "react";
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
  toolSteps?: AiChatMessage["toolSteps"];
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
          className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm ${
            isUser ? "bg-white/10 text-gray-200" : "bg-indigo-500/15 text-indigo-200"
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

        {message.toolSteps && message.toolSteps.length > 0 ? (
          <ToolStepsPanel steps={message.toolSteps} />
        ) : null}

        {message.citations && message.citations.length > 0 ? (
          <CitationChips citations={message.citations} label={t("aiChat.citationLabel")} />
        ) : null}
      </div>
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  wiki_search: "Wiki Search",
  wiki_list_pages: "Wiki List Pages",
  wiki_read_page: "Wiki Read Page",
  drive_search: "Drive Search",
  drive_read: "Drive Read",
  github_search: "GitHub Search",
  github_read: "GitHub Read",
};

function ToolStepsPanel({ steps }: { steps: NonNullable<AiChatMessage["toolSteps"]> }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-2 border-t border-gray-200 pt-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
      >
        <svg
          className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {t("aiChat.toolStepsLabel", { count: steps.length })}
      </button>
      {open && (
        <div className="mt-1 space-y-1.5">
          {steps.map((step) => (
            <div
              key={`${step.toolName}-${JSON.stringify(step.toolArgs)}`}
              className="rounded bg-gray-50 px-2 py-1.5 text-xs text-gray-600"
            >
              <span className="font-mono font-semibold">
                {TOOL_LABELS[step.toolName] ?? step.toolName}
              </span>
              <span className="ml-1 text-gray-400">
                (
                {Object.entries(step.toolArgs)
                  .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                  .join(", ")}
                )
              </span>
              {step.toolResult && (
                <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-gray-500">
                  {step.toolResult.slice(0, 300)}
                  {step.toolResult.length > 300 ? "..." : ""}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
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
        {citations.map((citation) => {
          const isDrive = citation.source === "drive" || !!citation.driveFileId;
          const isGithub = citation.source === "github" || !!citation.githubFileId;

          if (isGithub && citation.githubLink) {
            return (
              <a
                key={`github-${citation.githubFileId ?? citation.pageId}`}
                href={citation.githubLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-700 hover:bg-purple-100"
              >
                <GithubIcon />
                {citation.githubFileName ?? citation.pageTitle}
              </a>
            );
          }

          if (isGithub) {
            return (
              <span
                key={`github-${citation.githubFileId ?? citation.pageId}`}
                className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-700"
              >
                <GithubIcon />
                {citation.githubFileName ?? citation.pageTitle}
              </span>
            );
          }

          if (isDrive && citation.driveLink) {
            return (
              <a
                key={`drive-${citation.driveFileId ?? citation.pageId}`}
                href={citation.driveLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700 hover:bg-green-100"
              >
                <DriveIcon />
                {citation.driveFileName ?? citation.pageTitle}
              </a>
            );
          }

          if (isDrive) {
            return (
              <span
                key={`drive-${citation.driveFileId ?? citation.pageId}`}
                className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700"
              >
                <DriveIcon />
                {citation.driveFileName ?? citation.pageTitle}
              </span>
            );
          }

          return (
            <Link
              key={citation.pageId}
              href={`/wiki/${citation.pageId}`}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-100"
            >
              <WikiIcon />
              {citation.pageTitle}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function WikiIcon() {
  return (
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
  );
}

function DriveIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 87.3 78" fill="currentColor" aria-hidden="true">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H1.2c0 1.55.4 3.1 1.2 4.5l4.2 9.35z" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3L1.2 46.7c-.8 1.4-1.2 2.95-1.2 4.5h27.5l16.15-26.2z" />
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.9l6.85 11.8 6.8 11.95v.05z" />
      <path d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.85 0H34.45c-1.65 0-3.2.45-4.55 1.2L43.65 25z" />
      <path d="M59.9 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.55 1.2h36.8c1.65 0 3.2-.45 4.55-1.2L59.9 53z" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28h27.5c0-1.55-.4-3.1-1.2-4.5l-12.7-22z" />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
