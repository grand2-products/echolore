"use client";

import type { AituberCharacterDto } from "@echolore/shared/contracts";
import { useCallback, useEffect, useState } from "react";
import { aituberApi } from "@/lib/api/aituber";
import { useT } from "@/lib/i18n";

export function useCharacters() {
  const t = useT();
  const [characters, setCharacters] = useState<AituberCharacterDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

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

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const id = deleteTarget;
    setDeleteTarget(null);
    try {
      await aituberApi.deleteCharacter(id);
      setCharacters((prev) => prev.filter((c) => c.id !== id));
      setMessage(t("aituber.characters.deleted"));
    } catch {
      setError(t("aituber.characters.deleteError"));
    }
  }, [deleteTarget, t]);

  const cancelDelete = useCallback(() => setDeleteTarget(null), []);

  return {
    characters,
    loading,
    error,
    message,
    deleteTarget,
    setDeleteTarget,
    confirmDelete,
    cancelDelete,
  };
}
