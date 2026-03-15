"use client";

import type { AituberCharacterDto, AituberSessionDto } from "@echolore/shared/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { aituberApi } from "@/lib/api/aituber";
import { useT } from "@/lib/i18n";

export default function AituberPage() {
  const t = useT();
  const [characters, setCharacters] = useState<AituberCharacterDto[]>([]);
  const [sessions, setSessions] = useState<AituberSessionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create session state
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [selectedCharId, setSelectedCharId] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [charRes, sessRes] = await Promise.all([
          aituberApi.listCharacters(),
          aituberApi.listSessions(),
        ]);
        setCharacters(charRes.characters);
        setSessions(sessRes.sessions);
      } catch {
        setError(t("aituber.sessions.loadError"));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [t]);

  const handleCreate = async () => {
    if (!selectedCharId || !newTitle.trim()) return;
    setCreating(true);
    try {
      const { session } = await aituberApi.createSession({
        characterId: selectedCharId,
        title: newTitle.trim(),
      });
      setSessions((prev) => [session, ...prev]);
      setShowCreate(false);
      setNewTitle("");
      setSelectedCharId("");
    } catch {
      setError(t("aituber.sessions.createError"));
    } finally {
      setCreating(false);
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      created: "bg-gray-600 text-gray-200",
      live: "bg-red-600 text-white animate-pulse",
      ended: "bg-gray-500 text-gray-300",
    };
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || ""}`}>
        {t(`aituber.sessions.status.${status}` as never)}
      </span>
    );
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
        <div>
          <h1 className="text-2xl font-bold text-white">{t("aituber.title")}</h1>
          <p className="mt-1 text-sm text-gray-400">{t("aituber.description")}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/aituber/characters"
            className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
          >
            {t("aituber.characters.title")}
          </Link>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {t("aituber.sessions.create")}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {/* Create session modal */}
      {showCreate && (
        <div
          role="dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowCreate(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowCreate(false);
          }}
        >
          <div
            role="document"
            className="mx-4 w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-semibold text-white">
              {t("aituber.sessions.create")}
            </h2>

            <div className="mb-4">
              <label htmlFor="aituber-char-select" className="mb-1 block text-sm text-gray-400">
                {t("aituber.sessions.selectCharacter")}
              </label>
              <select
                id="aituber-char-select"
                value={selectedCharId}
                onChange={(e) => setSelectedCharId(e.target.value)}
                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white"
              >
                <option value="">--</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label htmlFor="aituber-session-title" className="mb-1 block text-sm text-gray-400">
                {t("aituber.sessions.sessionTitle")}
              </label>
              <input
                id="aituber-session-title"
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={t("aituber.sessions.titlePlaceholder")}
                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800"
              >
                {t("common.actions.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating || !selectedCharId || !newTitle.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {creating ? "..." : t("aituber.sessions.create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sessions list */}
      <div className="space-y-3">
        {sessions.length === 0 && (
          <p className="py-12 text-center text-gray-500">{t("aituber.sessions.empty")}</p>
        )}
        {sessions.map((session) => (
          <Link
            key={session.id}
            href={`/aituber/${session.id}`}
            className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800/50 p-4 transition hover:bg-gray-800"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">{session.title}</span>
                {statusBadge(session.status)}
              </div>
              {session.characterName && (
                <p className="mt-1 text-xs text-gray-400">{session.characterName}</p>
              )}
            </div>
            <div className="text-right text-xs text-gray-500">
              {new Date(session.createdAt).toLocaleDateString()}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
