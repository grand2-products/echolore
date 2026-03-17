"use client";

import type { AituberCharacterDto } from "@echolore/shared/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { aituberApi } from "@/lib/api/aituber";
import { useT } from "@/lib/i18n";

interface CharacterForm {
  name: string;
  personality: string;
  systemPrompt: string;
  speakingStyle: string;
  languageCode: string;
  voiceName: string;
  isPublic: boolean;
}

const emptyForm: CharacterForm = {
  name: "",
  personality: "",
  systemPrompt: "",
  speakingStyle: "",
  languageCode: "ja-JP",
  voiceName: "",
  isPublic: false,
};

export default function AituberCharactersPage() {
  const t = useT();
  const [characters, setCharacters] = useState<AituberCharacterDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CharacterForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { characters: list } = await aituberApi.listCharacters();
        setCharacters(list);
      } catch {
        setError(t("aituber.characters.loadError"));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [t]);

  const handleEdit = (char: AituberCharacterDto) => {
    setEditingId(char.id);
    setForm({
      name: char.name,
      personality: char.personality,
      systemPrompt: char.systemPrompt,
      speakingStyle: char.speakingStyle || "",
      languageCode: char.languageCode,
      voiceName: char.voiceName || "",
      isPublic: char.isPublic,
    });
    setAvatarFile(null);
  };

  const handleNew = () => {
    setEditingId("new");
    setForm(emptyForm);
    setAvatarFile(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (editingId === "new") {
        const { character } = await aituberApi.createCharacter({
          name: form.name,
          personality: form.personality,
          systemPrompt: form.systemPrompt,
          speakingStyle: form.speakingStyle || undefined,
          languageCode: form.languageCode,
          voiceName: form.voiceName || undefined,
          isPublic: form.isPublic,
        });
        let createdCharacter = character;
        if (avatarFile != null) {
          try {
            createdCharacter = (await aituberApi.uploadCharacterAvatar(character.id, avatarFile))
              .character;
          } catch {
            // Character created but avatar upload failed — still add to list
            setError(t("aituber.characters.avatarUploadError") ?? "Avatar upload failed");
          }
        }
        setCharacters((prev) => [createdCharacter, ...prev]);
        setMessage(t("aituber.characters.created"));
      } else if (editingId) {
        const { character } = await aituberApi.updateCharacter(editingId, {
          name: form.name,
          personality: form.personality,
          systemPrompt: form.systemPrompt,
          speakingStyle: form.speakingStyle || null,
          languageCode: form.languageCode,
          voiceName: form.voiceName || null,
          isPublic: form.isPublic,
        });
        const updatedCharacter =
          avatarFile != null
            ? (await aituberApi.uploadCharacterAvatar(editingId, avatarFile)).character
            : character;
        setCharacters((prev) => prev.map((c) => (c.id === editingId ? updatedCharacter : c)));
        setMessage(t("aituber.characters.updated"));
      }
      setEditingId(null);
      setAvatarFile(null);
    } catch {
      setError(t("aituber.characters.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("aituber.characters.deleteConfirm"))) return;
    try {
      await aituberApi.deleteCharacter(id);
      setCharacters((prev) => prev.filter((c) => c.id !== id));
      setMessage(t("aituber.characters.deleted"));
      if (editingId === id) setEditingId(null);
    } catch {
      setError(t("aituber.characters.deleteError"));
    }
  };

  const updateField = <K extends keyof CharacterForm>(key: K, value: CharacterForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

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
        {/* Character list */}
        <div className="space-y-3">
          {characters.length === 0 && (
            <p className="py-12 text-center text-gray-500">{t("aituber.characters.empty")}</p>
          )}
          {characters.map((char) => (
            <button
              type="button"
              key={char.id}
              className={`cursor-pointer rounded-lg border p-4 text-left transition ${
                editingId === char.id
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white hover:bg-gray-50 hover:border-blue-300"
              }`}
              onClick={() => handleEdit(char)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleEdit(char);
              }}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{char.name}</span>
                <div className="flex items-center gap-2">
                  {char.isPublic && (
                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                      {t("aituber.characters.isPublic")}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(char.id);
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

        {/* Edit form */}
        {editingId && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {editingId === "new" ? t("aituber.characters.create") : t("aituber.characters.edit")}
            </h2>

            <div className="space-y-4">
              <Field label={t("aituber.characters.name")}>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </Field>

              <Field label={t("aituber.characters.personality")}>
                <textarea
                  value={form.personality}
                  onChange={(e) => updateField("personality", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </Field>

              <Field label={t("aituber.characters.systemPrompt")}>
                <textarea
                  value={form.systemPrompt}
                  onChange={(e) => updateField("systemPrompt", e.target.value)}
                  rows={5}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </Field>

              <Field label={t("aituber.characters.speakingStyle")}>
                <input
                  type="text"
                  value={form.speakingStyle}
                  onChange={(e) => updateField("speakingStyle", e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label={t("aituber.characters.languageCode")}>
                  <input
                    type="text"
                    value={form.languageCode}
                    onChange={(e) => updateField("languageCode", e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  />
                </Field>

                <Field label={t("aituber.characters.voiceName")}>
                  <input
                    type="text"
                    value={form.voiceName}
                    onChange={(e) => updateField("voiceName", e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  />
                </Field>
              </div>

              <Field label={t("aituber.characters.avatarFile")}>
                <input
                  type="file"
                  accept=".vrm,model/gltf-binary"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file && file.size > 50 * 1024 * 1024) {
                      setError(t("aituber.characters.fileTooLarge") ?? "File exceeds 50MB limit");
                      e.target.value = "";
                      return;
                    }
                    setAvatarFile(file);
                  }}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                />
                <p className="mt-1 text-xs text-gray-500">
                  {t("aituber.characters.avatarUploadHint")}
                </p>
              </Field>

              {editingId !== "new" && characters.find((c) => c.id === editingId)?.avatarUrl ? (
                <Field label={t("aituber.characters.avatarPreview")}>
                  <a
                    href={(() => {
                      const url = characters.find((c) => c.id === editingId)?.avatarUrl;
                      if (!url || (!url.startsWith("/") && !url.startsWith("https://"))) return "#";
                      return url;
                    })()}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {t("aituber.characters.avatarDownload")}
                  </a>
                </Field>
              ) : null}

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.isPublic}
                  onChange={(e) => updateField("isPublic", e.target.checked)}
                  className="rounded border-gray-300"
                />
                {t("aituber.characters.isPublic")}
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {t("common.actions.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || !form.name || !form.personality || !form.systemPrompt}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? t("aituber.characters.saving") : t("aituber.characters.save")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-gray-700">
        {label}
      </label>
      <div id={id}>{children}</div>
    </div>
  );
}
