"use client";

import type { BlockNoteEditor } from "@blocknote/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

interface TableOfContentsProps {
  editor: BlockNoteEditor | null;
  scrollContainerRef: React.RefObject<HTMLElement | null>;
}

function getBlockText(block: { content?: unknown[] }): string {
  if (!Array.isArray(block.content)) return "";
  return (block.content as Array<{ type: string; text?: string }>)
    .filter((i) => i.type === "text")
    .map((i) => i.text ?? "")
    .join("");
}

function extractHeadings(editor: BlockNoteEditor): HeadingItem[] {
  const headings: HeadingItem[] = [];
  for (const block of editor.document) {
    if (block.type === "heading") {
      const level = (block.props as { level?: number }).level ?? 1;
      const text = getBlockText(block);
      if (text.trim()) {
        headings.push({ id: block.id, text: text.trim(), level });
      }
    }
  }
  return headings;
}

function setupObserver(
  container: HTMLElement,
  onActive: (id: string) => void
): { observer: IntersectionObserver; disconnect: () => void } {
  const headingEls = container.querySelectorAll("[data-node-type='heading']");
  const map = new Map<string, HTMLElement>();
  for (const el of headingEls) {
    const blockId = el.getAttribute("data-id");
    if (blockId) map.set(blockId, el as HTMLElement);
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute("data-id");
          if (id) onActive(id);
        }
      }
    },
    {
      root: container,
      rootMargin: "-80px 0px 0px 0px",
      threshold: 0,
    }
  );

  for (const el of map.values()) {
    observer.observe(el);
  }

  return { observer, disconnect: () => observer.disconnect() };
}

export function TableOfContents({ editor, scrollContainerRef }: TableOfContentsProps) {
  const t = useT();
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const observerCleanupRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!editor) {
      setHeadings([]);
      observerCleanupRef.current?.();
      observerCleanupRef.current = null;
      return;
    }

    const syncObserver = () => {
      observerCleanupRef.current?.();
      const container = scrollContainerRef.current;
      if (container) {
        const { disconnect } = setupObserver(container, setActiveId);
        observerCleanupRef.current = disconnect;
      }
    };

    const update = () => {
      if (!mountedRef.current) return;
      setHeadings(extractHeadings(editor));
      requestAnimationFrame(() => {
        if (!mountedRef.current) return;
        syncObserver();
      });
    };

    update();

    editor.onEditorContentChange(update);
    return () => {
      observerCleanupRef.current?.();
      observerCleanupRef.current = null;
    };
  }, [editor, scrollContainerRef]);

  const scrollToHeading = useCallback(
    (id: string) => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const el = container.querySelector(`[data-id="${id}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [scrollContainerRef]
  );

  const minLevel = useMemo(() => {
    if (headings.length === 0) return 1;
    return Math.min(...headings.map((h) => h.level));
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav className="w-56 shrink-0">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {t("wiki.toc.title")}
      </p>
      <ul className="space-y-1 border-l border-gray-200">
        {headings.map((h) => {
          const indent = h.level - minLevel;
          const isActive = h.id === activeId;
          return (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => scrollToHeading(h.id)}
                className={`block w-full cursor-pointer border-l-2 py-1 pr-2 text-left text-[13px] leading-snug transition-colors ${
                  isActive
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-900"
                } ${indent === 0 ? "pl-3" : indent === 1 ? "pl-5" : "pl-7"}`}
              >
                <span className="line-clamp-2">{h.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
