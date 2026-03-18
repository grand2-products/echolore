"use client";

import type { AituberCharacterDto } from "@echolore/shared/contracts";
import { useCallback, useEffect, useState } from "react";
import { aituberApi } from "@/lib/api/aituber";
import { useT } from "@/lib/i18n";

export interface CharacterForm {
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

export function useCharacters() {
  const t = useT();
  const [characters, setCharacters] = useState<AituberCharacterDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CharacterForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const selectedCharacter =
    editingId && editingId !== "new" ? (characters.find((c) => c.id === editingId) ?? null) : null;

  // Auto-clear messages after 3s
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

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

  const handleEdit = useCallback((char: AituberCharacterDto) => {
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
  }, []);

  const handleNew = useCallback(() => {
    setEditingId("new");
    setForm(emptyForm);
    setAvatarFile(null);
  }, []);

  const handleCancel = useCallback(() => {
    setEditingId(null);
    setAvatarFile(null);
  }, []);

  const handleSave = useCallback(async () => {
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
        let created = character;
        if (avatarFile != null) {
          try {
            created = (await aituberApi.uploadCharacterAvatar(character.id, avatarFile)).character;
          } catch {
            setError(t("aituber.characters.avatarUploadError") ?? "Avatar upload failed");
          }
        }
        setCharacters((prev) => [created, ...prev]);
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
        const updated =
          avatarFile != null
            ? (await aituberApi.uploadCharacterAvatar(editingId, avatarFile)).character
            : character;
        setCharacters((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
        setMessage(t("aituber.characters.updated"));
      }
      setEditingId(null);
      setAvatarFile(null);
    } catch {
      setError(t("aituber.characters.saveError"));
    } finally {
      setSaving(false);
    }
  }, [editingId, form, avatarFile, t]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm(t("aituber.characters.deleteConfirm"))) return;
      try {
        await aituberApi.deleteCharacter(id);
        setCharacters((prev) => prev.filter((c) => c.id !== id));
        setMessage(t("aituber.characters.deleted"));
        setEditingId((prev) => (prev === id ? null : prev));
      } catch {
        setError(t("aituber.characters.deleteError"));
      }
    },
    [t]
  );

  const updateField = useCallback(
    <K extends keyof CharacterForm>(key: K, value: CharacterForm[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  return {
    characters,
    loading,
    error,
    message,
    editingId,
    form,
    saving,
    avatarFile,
    selectedCharacter,
    setAvatarFile,
    setError,
    handleEdit,
    handleNew,
    handleCancel,
    handleSave,
    handleDelete,
    updateField,
  };
}
