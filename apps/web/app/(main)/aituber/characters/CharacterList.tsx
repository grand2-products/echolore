"use client";

import type { AituberCharacterDto } from "@echolore/shared/contracts";
import { useT } from "@/lib/i18n";

interface CharacterListProps {
  characters: AituberCharacterDto[];
  editingId: string | null;
  onEdit: (char: AituberCharacterDto) => void;
  onDelete: (id: string) => void;
}

export function CharacterList({ characters, editingId, onEdit, onDelete }: CharacterListProps) {
  const t = useT();

  if (characters.length === 0) {
    return <p className="py-12 text-center text-gray-500">{t("aituber.characters.empty")}</p>;
  }

  return (
    <div className="space-y-3">
      {characters.map((char) => (
        <button
          type="button"
          key={char.id}
          className={`w-full cursor-pointer rounded-lg border p-4 text-left transition ${
            editingId === char.id
              ? "border-blue-500 bg-blue-50"
              : "border-gray-200 bg-white hover:bg-gray-50 hover:border-blue-300"
          }`}
          onClick={() => onEdit(char)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {char.avatarUrl && (
                <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                  <span className="text-xs text-gray-500">3D</span>
                </div>
              )}
              <span className="font-medium text-gray-900">{char.name}</span>
            </div>
            <div className="flex items-center gap-2">
              {char.isPublic && (
                <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                  {t("aituber.characters.isPublic")}
                </span>
              )}
              {char.voiceName && (
                <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">
                  {char.languageCode}
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void onDelete(char.id);
                }}
                className="text-xs text-red-600 hover:text-red-700"
              >
                {t("aituber.characters.delete")}
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-500 line-clamp-2">{char.personality}</p>
        </button>
      ))}
    </div>
  );
}
