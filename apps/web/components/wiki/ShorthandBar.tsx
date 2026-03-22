"use client";

import type { BlockNoteEditor } from "@blocknote/core";
import { useCallback, useRef, useState } from "react";
import { wikiApi } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import { applyShorthandOperations, serializeEditorForLlm } from "@/lib/wiki-shorthand";

interface ShorthandBarProps {
  pageId: string;
  pageTitle: string;
  // biome-ignore lint/suspicious/noExplicitAny: BlockNoteEditor generics vary
  editor: BlockNoteEditor<any, any, any>;
}

export function ShorthandBar({ pageId, pageTitle, editor }: ShorthandBarProps) {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const statusRef = useRef(status);
  statusRef.current = status;
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSubmit = useCallback(async () => {
    const text = input.trim();
    if (!text || statusRef.current === "loading") return;

    setStatus("loading");

    try {
      const blocks = serializeEditorForLlm(editor);
      const result = await wikiApi.shorthand(pageId, {
        input: text,
        pageTitle,
        blocks,
      });

      applyShorthandOperations(editor, result.operations);
      setInput("");
      setStatus("idle");
    } catch (err) {
      console.error("Shorthand failed:", err);

      // Fallback: insert raw text at the end
      try {
        const doc = editor.document;
        const lastBlock = doc[doc.length - 1];
        if (lastBlock) {
          editor.insertBlocks([{ type: "paragraph", content: text }], lastBlock, "after");
        }
      } catch (fallbackErr) {
        console.error("Fallback insert failed:", fallbackErr);
      }

      setStatus("error");
      setErrorMsg(getApiErrorMessage(err, t("wiki.shorthand.error")));
      setInput("");

      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => {
        setStatus("idle");
        setErrorMsg("");
      }, 3000);
    }
  }, [input, pageId, pageTitle, editor, t, getApiErrorMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <div className="mt-4 border-t border-gray-200 pt-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={status === "loading"}
          placeholder={t("wiki.shorthand.placeholder")}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={status === "loading" || !input.trim()}
          className="flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "loading" ? (
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              role="img"
              aria-label="Loading"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <svg
              className="h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              role="img"
              aria-label="Send"
            >
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          )}
        </button>
      </div>
      {status === "error" && errorMsg && <p className="mt-1 text-xs text-red-500">{errorMsg}</p>}
    </div>
  );
}
