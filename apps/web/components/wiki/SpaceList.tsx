"use client";

import type { Space } from "@/lib/api";
import { useT } from "@/lib/i18n";

const SPACE_ICON: Record<string, string> = { general: "G", team: "T", personal: "P" };

interface SpaceListProps {
  spaces: Space[];
  selectedId?: string | null;
  onSelect: (spaceId: string) => void;
  size?: "sm" | "md";
}

export function SpaceList({ spaces, selectedId, onSelect, size = "md" }: SpaceListProps) {
  const t = useT();
  const padding = size === "sm" ? "p-3" : "p-4";
  const iconSize = size === "sm" ? "h-7 w-7 text-xs" : "h-8 w-8 text-sm";

  return (
    <div className="space-y-2">
      {spaces.map((space) => (
        <button
          key={space.id}
          type="button"
          onClick={() => onSelect(space.id)}
          className={`flex w-full items-center gap-3 rounded-lg border ${padding} text-left transition ${
            selectedId === space.id
              ? "border-blue-500 bg-blue-50"
              : "border-gray-200 bg-white hover:border-blue-500 hover:shadow-sm"
          }`}
        >
          <span
            className={`flex items-center justify-center rounded-md bg-gray-100 font-medium text-gray-600 ${iconSize}`}
          >
            {SPACE_ICON[space.type] ?? "?"}
          </span>
          <div>
            <p className={`font-medium text-gray-900 ${size === "sm" ? "text-sm" : ""}`}>
              {space.name}
            </p>
            <p className="text-xs text-gray-500">{t(`wiki.spaces.${space.type}`)}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
