"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import { CharacterEditForm } from "./CharacterEditForm";
import { CharacterList } from "./CharacterList";
import { CharacterPreview } from "./CharacterPreview";
import { useCharacters } from "./use-characters";

export default function AituberCharactersPage() {
  const t = useT();
  const {
    characters,
    loading,
    error,
    message,
    editingId,
    form,
    saving,
    selectedCharacter,
    setAvatarFile,
    setError,
    handleEdit,
    handleNew,
    handleCancel,
    handleSave,
    handleDelete,
    updateField,
  } = useCharacters();

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-gray-500">{t("common.status.loading")}</p>
      </div>
    );
  }

  return (
    <div className="p-8">
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
        <button
          type="button"
          onClick={handleNew}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {t("aituber.characters.create")}
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {message && <p className="mb-4 text-sm text-green-600">{message}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Character list */}
        <CharacterList
          characters={characters}
          editingId={editingId}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />

        {/* Right: Edit form or Preview */}
        <div className="space-y-6">
          {editingId && (
            <CharacterEditForm
              editingId={editingId}
              form={form}
              saving={saving}
              characters={characters}
              onUpdateField={updateField}
              onAvatarFileChange={setAvatarFile}
              onSave={() => void handleSave()}
              onCancel={handleCancel}
              onError={setError}
            />
          )}

          {selectedCharacter && <CharacterPreview character={selectedCharacter} />}
        </div>
      </div>
    </div>
  );
}
