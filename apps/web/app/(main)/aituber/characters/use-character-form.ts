"use client";

import { useRouter } from "next/navigation";
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

export function useCharacterForm(characterId: string | "new") {
  const t = useT();
  const router = useRouter();
  const isNew = characterId === "new";

  const [form, setForm] = useState<CharacterForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [motionProfile, setMotionProfile] = useState<string | null>(null);
  // True when motionProfile was re-generated during this session (avatar changed)
  const [motionProfileDirty, setMotionProfileDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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

  // Fetch character data when editing
  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    const load = async () => {
      try {
        const { character } = await aituberApi.getCharacter(characterId);
        if (cancelled) return;
        setForm({
          name: character.name,
          personality: character.personality,
          systemPrompt: character.systemPrompt,
          speakingStyle: character.speakingStyle || "",
          languageCode: character.languageCode,
          voiceName: character.voiceName || "",
          isPublic: character.isPublic,
        });
        setAvatarUrl(character.avatarUrl);
        setMotionProfile(character.motionProfile ?? null);
      } catch {
        if (!cancelled) setError(t("aituber.characters.loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [characterId, isNew, t]);

  const updateMotionProfile = useCallback((profile: string | null) => {
    setMotionProfile(profile);
    setMotionProfileDirty(true);
  }, []);

  const updateField = useCallback(
    <K extends keyof CharacterForm>(key: K, value: CharacterForm[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const { character } = await aituberApi.createCharacter({
          name: form.name,
          personality: form.personality,
          systemPrompt: form.systemPrompt,
          speakingStyle: form.speakingStyle || undefined,
          languageCode: form.languageCode,
          voiceName: form.voiceName || undefined,
          isPublic: form.isPublic,
          // Only send motionProfile on create when avatar was analysed successfully.
          // If VRM analysis failed, motionProfile is null — omit to avoid storing empty data.
          ...(motionProfileDirty && motionProfile ? { motionProfile } : {}),
        });
        if (avatarFile != null) {
          try {
            await aituberApi.uploadCharacterAvatar(character.id, avatarFile);
          } catch {
            setError(t("aituber.characters.avatarUploadError") ?? "Avatar upload failed");
          }
        }
        router.push(`/aituber/characters/${character.id}`);
      } else {
        const { character } = await aituberApi.updateCharacter(characterId, {
          name: form.name,
          personality: form.personality,
          systemPrompt: form.systemPrompt,
          speakingStyle: form.speakingStyle || null,
          languageCode: form.languageCode,
          voiceName: form.voiceName || null,
          isPublic: form.isPublic,
          // On update, send null to clear stale profile when avatar changed but analysis failed.
          ...(motionProfileDirty ? { motionProfile } : {}),
        });
        if (avatarFile != null) {
          const { character: updated } = await aituberApi.uploadCharacterAvatar(
            characterId,
            avatarFile
          );
          setAvatarUrl(updated.avatarUrl);
        } else {
          setAvatarUrl(character.avatarUrl);
        }
        setAvatarFile(null);
        setMessage(t("aituber.characters.updated"));
      }
    } catch {
      setError(t("aituber.characters.saveError"));
    } finally {
      setSaving(false);
    }
  }, [isNew, characterId, form, avatarFile, motionProfile, motionProfileDirty, t, router]);

  const handleCancel = useCallback(() => {
    router.push("/aituber/characters");
  }, [router]);

  return {
    form,
    saving,
    loading,
    avatarFile,
    avatarUrl,
    motionProfile,
    error,
    message,
    setAvatarFile,
    setMotionProfile: updateMotionProfile,
    setError,
    updateField,
    handleSave,
    handleCancel,
  };
}
