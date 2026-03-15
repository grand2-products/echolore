"use client";

import type { RealtimeTranscriptSegment } from "@/lib/api";
import { useFormatters, useT } from "@/lib/i18n";
import { useEffect, useRef } from "react";

export interface TranscriptPanelProps {
  segments: RealtimeTranscriptSegment[];
  open: boolean;
  onClose: () => void;
}

export default function TranscriptPanel({ segments, open, onClose }: TranscriptPanelProps) {
  const t = useT();
  const { number } = useFormatters();
  const scrollRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new segments only
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [segments]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
          role="presentation"
        />
      )}
      <dialog
        open={open}
        aria-modal="true"
        aria-label={t("meetings.room.realtimeTranscript")}
        className={`fixed left-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-r border-gray-700/50 bg-gray-900 shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-gray-700/50 px-5 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-white">
              {t("meetings.room.realtimeTranscript")}
            </h2>
            <span className="rounded-full bg-gray-700/60 px-2 py-0.5 text-xs text-gray-400">
              {t("meetings.room.segmentCount", { count: number(segments.length) })}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
          {segments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg
                className="mb-3 h-10 w-10 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
                />
              </svg>
              <p className="text-sm text-gray-500">{t("meetings.room.noTranscript")}</p>
            </div>
          ) : (
            segments.map((segment) => (
              <div key={segment.id} className="rounded-lg bg-gray-800/80 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-blue-400">{segment.speakerLabel}</span>
                  <span className={segment.isPartial ? "text-amber-400" : "text-gray-500"}>
                    {segment.isPartial ? t("meetings.room.partial") : t("meetings.room.final")}
                  </span>
                </div>
                <div className="mt-1.5 text-sm leading-relaxed text-gray-200">
                  {segment.content}
                </div>
              </div>
            ))
          )}
        </div>
      </dialog>
    </>
  );
}
