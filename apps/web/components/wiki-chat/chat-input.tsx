"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

interface ChatInputProps {
  onSend: (content: string) => void;
  isPending: boolean;
  error?: Error | null;
  errorMessage?: string;
}

export function ChatInput({ onSend, isPending, error, errorMessage }: ChatInputProps) {
  const t = useT();
  const [input, setInput] = useState("");
  const lastSentRef = useRef("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (error && lastSentRef.current) {
      setInput(lastSentRef.current);
      lastSentRef.current = "";
    }
  }, [error]);

  const handleSend = () => {
    const content = input.trim();
    if (!content || isPending) return;
    lastSentRef.current = content;
    setInput("");
    onSend(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-gray-200 px-6 py-4">
      <div className="mx-auto flex max-w-3xl gap-3">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("wikiChat.inputPlaceholder")}
          rows={1}
          disabled={isPending}
          className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || isPending}
          className="shrink-0 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? t("wikiChat.sending") : t("wikiChat.send")}
        </button>
      </div>
      {error ? (
        <p className="mx-auto mt-2 max-w-3xl text-sm text-red-600">
          {errorMessage ?? error.message}
        </p>
      ) : null}
    </div>
  );
}
