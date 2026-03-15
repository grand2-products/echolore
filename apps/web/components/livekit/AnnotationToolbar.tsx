"use client";

import { useT } from "@/lib/i18n";
import type { AnnotationTool } from "./annotation-types";

interface AnnotationToolbarProps {
  activeTool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  activeColor: string;
  onColorChange: (color: string) => void;
  colors: readonly string[];
  annotationEnabled: boolean;
  onToggleAnnotation: () => void;
  onClear: () => void;
}

const TOOL_ICONS: Record<AnnotationTool, { label: string; path: string }> = {
  pointer: {
    label: "annotation.pointer",
    path: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5.25 12 5.25c4.478 0 8.268 2.693 9.542 6.75-1.274 4.057-5.064 6.75-9.542 6.75-4.477 0-8.268-2.693-9.542-6.75z",
  },
  freehand: {
    label: "annotation.freehand",
    path: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z",
  },
  highlight: {
    label: "annotation.highlight",
    path: "M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576L2.049 12.77a.75.75 0 010-1.442l2.846-.813A3.75 3.75 0 007.47 7.89l.813-2.846A.75.75 0 019 4.5z",
  },
};

export default function AnnotationToolbar({
  activeTool,
  onToolChange,
  activeColor,
  onColorChange,
  colors,
  annotationEnabled,
  onToggleAnnotation,
  onClear,
}: AnnotationToolbarProps) {
  const t = useT();

  return (
    <div className="absolute right-3 top-3 z-30 flex items-center gap-1.5 rounded-xl bg-gray-900/90 px-3 py-2 shadow-xl ring-1 ring-white/10 backdrop-blur">
      {/* Toggle annotation mode */}
      <button
        type="button"
        onClick={onToggleAnnotation}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs transition-colors ${
          annotationEnabled
            ? "bg-blue-600 text-white"
            : "text-gray-400 hover:bg-gray-700 hover:text-white"
        }`}
        title={t("meetings.room.annotation.toggle")}
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z"
          />
        </svg>
      </button>

      {annotationEnabled && (
        <>
          <div className="mx-0.5 h-5 w-px bg-gray-700" />

          {/* Tool buttons */}
          {(Object.keys(TOOL_ICONS) as AnnotationTool[]).map((tool) => {
            const icon = TOOL_ICONS[tool];
            return (
              <button
                key={tool}
                type="button"
                onClick={() => onToolChange(tool)}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  activeTool === tool
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:bg-gray-700/60 hover:text-white"
                }`}
                title={t(icon.label)}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={icon.path} />
                </svg>
              </button>
            );
          })}

          <div className="mx-0.5 h-5 w-px bg-gray-700" />

          {/* Color palette */}
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onColorChange(color)}
              className={`h-5 w-5 rounded-full border-2 transition-all ${
                activeColor === color
                  ? "border-white scale-110"
                  : "border-transparent hover:border-gray-500"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}

          <div className="mx-0.5 h-5 w-px bg-gray-700" />

          {/* Clear */}
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
          >
            {t("meetings.room.annotation.clear")}
          </button>
        </>
      )}
    </div>
  );
}
