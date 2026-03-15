"use client";

import { useMemo } from "react";

interface MarkdownContentProps {
  content: string;
}

/**
 * Safe markdown renderer for AI assistant responses.
 * Converts basic markdown syntax to React elements without dangerouslySetInnerHTML.
 */
export function MarkdownContent({ content }: MarkdownContentProps) {
  const elements = useMemo(() => parseMarkdown(content), [content]);
  return <div>{elements}</div>;
}

function parseMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: "ul" | "ol" | null = null;
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      if (listType === "ol") {
        elements.push(
          <ol key={`ol-${key++}`} className="my-1 list-decimal pl-5">
            {listItems}
          </ol>
        );
      } else {
        elements.push(
          <ul key={`ul-${key++}`} className="my-1 list-disc pl-5">
            {listItems}
          </ul>
        );
      }
      listItems = [];
      listType = null;
    }
  };

  for (const line of lines) {
    // Headings
    const h3Match = line.match(/^### (.+)$/);
    if (h3Match) {
      flushList();
      elements.push(
        <h3 key={key++} className="my-2 text-base font-semibold">
          {formatInline(h3Match[1] ?? "")}
        </h3>
      );
      continue;
    }
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) {
      flushList();
      elements.push(
        <h2 key={key++} className="my-2 text-lg font-semibold">
          {formatInline(h2Match[1] ?? "")}
        </h2>
      );
      continue;
    }
    const h1Match = line.match(/^# (.+)$/);
    if (h1Match) {
      flushList();
      elements.push(
        <h1 key={key++} className="my-2 text-xl font-bold">
          {formatInline(h1Match[1] ?? "")}
        </h1>
      );
      continue;
    }

    // Ordered list items
    const olMatch = line.match(/^\d+\. (.+)$/);
    if (olMatch) {
      if (listType === "ul") flushList();
      listType = "ol";
      listItems.push(
        <li key={`li-${key++}`} className="my-0">
          {formatInline(olMatch[1] ?? "")}
        </li>
      );
      continue;
    }

    // Unordered list items
    const liMatch = line.match(/^[-*] (.+)$/);
    if (liMatch) {
      if (listType === "ol") flushList();
      listType = "ul";
      listItems.push(
        <li key={`li-${key++}`} className="my-0">
          {formatInline(liMatch[1] ?? "")}
        </li>
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      flushList();
      continue;
    }

    // Paragraph
    flushList();
    elements.push(
      <p key={key++} className="my-1">
        {formatInline(line)}
      </p>
    );
  }

  flushList();
  return elements;
}

function formatInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/s);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(formatCodeInline(boldMatch[1] ?? "", key++));
      parts.push(<strong key={`b-${key++}`}>{formatCodeInline(boldMatch[2] ?? "", key++)}</strong>);
      remaining = boldMatch[3] ?? "";
      continue;
    }

    // Italic
    const italicMatch = remaining.match(/^(.*?)\*(.+?)\*(.*)/s);
    if (italicMatch) {
      if (italicMatch[1]) parts.push(formatCodeInline(italicMatch[1] ?? "", key++));
      parts.push(<em key={`i-${key++}`}>{formatCodeInline(italicMatch[2] ?? "", key++)}</em>);
      remaining = italicMatch[3] ?? "";
      continue;
    }

    // No more inline formatting
    parts.push(formatCodeInline(remaining, key++));
    break;
  }

  return parts;
}

function formatCodeInline(text: string, baseKey: number): React.ReactNode {
  const parts = text.split(/`([^`]+)`/);
  if (parts.length === 1) return text;

  return parts.map((part, i) =>
    i % 2 === 1 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: split parts have no unique id
      <code key={`c-${baseKey}-${i}`} className="rounded bg-gray-200 px-1 py-0.5 text-xs">
        {part}
      </code>
    ) : (
      part || null
    )
  );
}
