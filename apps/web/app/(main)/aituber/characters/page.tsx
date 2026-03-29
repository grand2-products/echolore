"use client";

import Link from "next/link";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useT } from "@/lib/i18n";
import { CharacterList } from "./CharacterList";
import { useCharacters } from "./use-characters";

export default function AituberCharactersPage() {
  const t = useT();
  const {
    characters,
    loading,
    error,
    message,
    deleteTarget,
    setDeleteTarget,
    confirmDelete,
    cancelDelete,
  } = useCharacters();

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-gray-500">{t("common.status.loading")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/aituber" className="text-gray-400 hover:text-gray-600">
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <title>Back</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{t("aituber.characters.title")}</h1>
        </div>
        <Link
          href="/aituber/characters/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {t("aituber.characters.create")}
        </Link>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {message && <p className="mb-4 text-sm text-green-600">{message}</p>}

      <CharacterList characters={characters} onDelete={setDeleteTarget} />
      <ConfirmDialog
        open={deleteTarget !== null}
        title={t("aituber.characters.deleteConfirm")}
        variant="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={cancelDelete}
      />
    </div>
  );
}
