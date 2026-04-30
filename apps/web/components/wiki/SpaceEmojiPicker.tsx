"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const EMOJI_LIST = [
  "📚",
  "📖",
  "📝",
  "📋",
  "📌",
  "📎",
  "🗂️",
  "🗃️",
  "🗄️",
  "📁",
  "💼",
  "🏢",
  "🏠",
  "🏗️",
  "🎨",
  "🔬",
  "🧪",
  "📊",
  "📈",
  "📉",
  "💡",
  "🔑",
  "🔒",
  "🛡️",
  "⚙️",
  "🛠️",
  "🔨",
  "🔧",
  "⚡",
  "🚀",
  "🎯",
  "🎪",
  "🎭",
  "🎮",
  "🎲",
  "🧩",
  "🎵",
  "🎶",
  "🏅",
  "🏆",
  "💎",
  "🌟",
  "⭐",
  "🌈",
  "🍀",
  "🌸",
  "🌺",
  "🌻",
  "🌲",
  "🌍",
  "🌎",
  "🌏",
  "🔴",
  "🟠",
  "🟡",
  "🟢",
  "🔵",
  "🟣",
  "⚪",
  "⚫",
  "❤️",
  "💙",
  "💚",
  "💜",
  "🤍",
];

interface SpaceEmojiPickerProps {
  emoji: string | null;
  onSelect: (emoji: string | null) => void;
}

export function SpaceEmojiPicker({ emoji, onSelect }: SpaceEmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open, handleClickOutside]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex h-5 w-5 items-center justify-center rounded text-sm hover:bg-gray-200"
      >
        {emoji ?? "📁"}
      </button>
      {open && (
        <div className="absolute left-0 top-6 z-50 grid w-56 grid-cols-8 gap-0.5 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg">
          {EMOJI_LIST.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onSelect(e);
                setOpen(false);
              }}
              className={`flex h-6 w-6 items-center justify-center rounded text-sm hover:bg-gray-100 ${
                emoji === e ? "bg-blue-100" : ""
              }`}
            >
              {e}
            </button>
          ))}
          {emoji && (
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
              className="col-span-8 mt-1 flex h-5 items-center justify-center rounded text-[10px] text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              ✕ clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
