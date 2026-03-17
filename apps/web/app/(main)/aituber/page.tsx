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
      created: "bg-gray-100 text-gray-600",
      live: "bg-red-100 text-red-700",
      ended: "bg-gray-100 text-gray-500",
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
        <p className="text-gray-500">{t("common.status.loading")}</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("aituber.title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{t("aituber.description")}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/aituber/characters"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            {t("aituber.characters.title")}
          </Link>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {t("aituber.sessions.create")}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {/* Create session modal */}
      {showCreate && (
        <div
          role="dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowCreate(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowCreate(false);
          }}
        >
          <div
            role="document"
            className="mx-4 w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {t("aituber.sessions.create")}
            </h2>

            <div className="mb-4">
              <label htmlFor="aituber-char-select" className="mb-1 block text-sm text-gray-700">
                {t("aituber.sessions.selectCharacter")}
              </label>
              <select
                id="aituber-char-select"
                value={selectedCharId}
                onChange={(e) => setSelectedCharId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
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
              <label htmlFor="aituber-session-title" className="mb-1 block text-sm text-gray-700">
                {t("aituber.sessions.sessionTitle")}
              </label>
              <input
                id="aituber-session-title"
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={t("aituber.sessions.titlePlaceholder")}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {t("common.actions.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={creating || !selectedCharId || !newTitle.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-blue-500 hover:shadow-md"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{session.title}</span>
                {statusBadge(session.status)}
              </div>
              {session.characterName && (
                <p className="mt-1 text-xs text-gray-500">{session.characterName}</p>
              )}
            </div>
            <div className="text-right text-xs text-gray-400">
              {new Date(session.createdAt).toLocaleDateString()}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
