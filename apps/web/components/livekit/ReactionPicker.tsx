"use client";

import { useT } from "@/lib/i18n";
import { REACTION_EMOJIS } from "@/lib/use-reactions";
import { useEffect, useRef, useState } from "react";

interface ReactionPickerProps {
  onReact: (emoji: string) => void;
  variant?: "dark" | "light";
}

export default function ReactionPicker({
  onReact,
  variant = "light",
}: ReactionPickerProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const buttonClasses =
    variant === "dark"
      ? "bg-gray-700/80 text-white hover:bg-gray-600"
      : "bg-white text-gray-700 hover:bg-gray-100 shadow-sm";

  return (
    <div ref={menuRef} className="group relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full transition-colors ${buttonClasses}`}
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z"
          />
        </svg>
      </button>

      {!open && (
        <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
          {t("meetings.room.reactions")}
        </span>
      )}

      {open && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded-xl border border-gray-700/50 bg-gray-900/95 p-2 shadow-xl backdrop-blur">
          <div className="grid grid-cols-4 gap-1">
            {REACTION_EMOJIS.map(({ emoji, label }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  onReact(emoji);
                  setOpen(false);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-xl transition-colors hover:bg-gray-700/60"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
