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
  avatarUrl: string;
  isPublic: boolean;
}

const emptyForm: CharacterForm = {
  name: "",
  personality: "",
  systemPrompt: "",
  speakingStyle: "",
  languageCode: "ja-JP",
  voiceName: "",
  avatarUrl: "",
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
      avatarUrl: char.avatarUrl || "",
      isPublic: char.isPublic,
    });
  };

  const handleNew = () => {
    setEditingId("new");
    setForm(emptyForm);
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
          avatarUrl: form.avatarUrl || undefined,
          isPublic: form.isPublic,
        });
        setCharacters((prev) => [character, ...prev]);
        setMessage(t("aituber.characters.created"));
      } else if (editingId) {
        const { character } = await aituberApi.updateCharacter(editingId, {
          name: form.name,
          personality: form.personality,
          systemPrompt: form.systemPrompt,
          speakingStyle: form.speakingStyle || null,
          languageCode: form.languageCode,
          voiceName: form.voiceName || null,
          avatarUrl: form.avatarUrl || null,
          isPublic: form.isPublic,
        });
        setCharacters((prev) => prev.map((c) => (c.id === editingId ? character : c)));
        setMessage(t("aituber.characters.updated"));
      }
      setEditingId(null);
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
        <p className="text-gray-400">{t("common.status.loading")}</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/aituber" className="text-gray-400 hover:text-white">
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
          <h1 className="text-2xl font-bold text-white">{t("aituber.characters.title")}</h1>
        </div>
        <button
          type="button"
          onClick={handleNew}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          {t("aituber.characters.create")}
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {message && <p className="mb-4 text-sm text-green-400">{message}</p>}

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
                  ? "border-indigo-500 bg-gray-800"
                  : "border-gray-700 bg-gray-800/50 hover:bg-gray-800"
              }`}
              onClick={() => handleEdit(char)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleEdit(char);
              }}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-white">{char.name}</span>
                <div className="flex items-center gap-2">
                  {char.isPublic && (
                    <span className="rounded bg-green-900/50 px-1.5 py-0.5 text-xs text-green-400">
                      {t("aituber.characters.isPublic")}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(char.id);
                    }}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    {t("aituber.characters.delete")}
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-400 line-clamp-2">{char.personality}</p>
            </button>
          ))}
        </div>

        {/* Edit form */}
        {editingId && (
          <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">
              {editingId === "new" ? t("aituber.characters.create") : t("aituber.characters.edit")}
            </h2>

            <div className="space-y-4">
              <Field label={t("aituber.characters.name")}>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white"
                />
              </Field>

              <Field label={t("aituber.characters.personality")}>
                <textarea
                  value={form.personality}
                  onChange={(e) => updateField("personality", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white"
                />
              </Field>

              <Field label={t("aituber.characters.systemPrompt")}>
                <textarea
                  value={form.systemPrompt}
                  onChange={(e) => updateField("systemPrompt", e.target.value)}
                  rows={5}
                  className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white"
                />
              </Field>

              <Field label={t("aituber.characters.speakingStyle")}>
                <input
                  type="text"
                  value={form.speakingStyle}
                  onChange={(e) => updateField("speakingStyle", e.target.value)}
                  className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white"
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label={t("aituber.characters.languageCode")}>
                  <input
                    type="text"
                    value={form.languageCode}
                    onChange={(e) => updateField("languageCode", e.target.value)}
                    className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white"
                  />
                </Field>

                <Field label={t("aituber.characters.voiceName")}>
                  <input
                    type="text"
                    value={form.voiceName}
                    onChange={(e) => updateField("voiceName", e.target.value)}
                    className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white"
                  />
                </Field>
              </div>

              <Field label={t("aituber.characters.avatarUrl")}>
                <input
                  type="text"
                  value={form.avatarUrl}
                  onChange={(e) => updateField("avatarUrl", e.target.value)}
                  className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white"
                />
              </Field>

              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={form.isPublic}
                  onChange={(e) => updateField("isPublic", e.target.checked)}
                  className="rounded border-gray-600"
                />
                {t("aituber.characters.isPublic")}
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                >
                  {t("common.actions.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || !form.name || !form.personality || !form.systemPrompt}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
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
      <label htmlFor={id} className="mb-1 block text-sm text-gray-400">
        {label}
      </label>
      <div id={id}>{children}</div>
    </div>
  );
}
