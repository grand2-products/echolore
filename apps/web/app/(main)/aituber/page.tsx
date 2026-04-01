"use client";

import type { AituberCharacterDto, AituberSessionDto } from "@echolore/shared/contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AituberStage } from "@/components/aituber/AituberStage";
import { aituberApi } from "@/lib/api/aituber";
import { useAuthContext } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { getPublicLivekitUrl } from "@/lib/runtime-env";

export default function AituberPage() {
  const t = useT();
  const { user } = useAuthContext();
  const isAdmin = user?.role === "admin";

  const [session, setSession] = useState<AituberSessionDto | null>(null);
  const [characters, setCharacters] = useState<AituberCharacterDto[]>([]);
  const [selectedCharId, setSelectedCharId] = useState("");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const livekitUrl = getPublicLivekitUrl();

  useEffect(() => {
    const load = async () => {
      try {
        const activeRes = await aituberApi.getActiveSession();
        setSession(activeRes.session);
        if (isAdmin) {
          const charRes = await aituberApi.listCharacters();
          const chars = charRes.characters ?? [];
          setCharacters(chars);
          const first = chars[0];
          if (first) {
            setSelectedCharId(first.id);
          }
        }
      } catch {
        setError(t("aituber.sessions.loadError"));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [t, isAdmin]);

  const handleStartLive = async () => {
    if (!selectedCharId) return;
    setStarting(true);
    setError(null);
    try {
      const { session: live } = await aituberApi.startLive(selectedCharId);
      setSession(live);
    } catch {
      setError(t("aituber.sessions.startError"));
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    if (!session) return;
    setStopping(true);
    setError(null);
    try {
      await aituberApi.stopSession(session.id);
      setSession(null);
    } catch {
      setError(t("aituber.sessions.stopError"));
    } finally {
      setStopping(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-gray-500">{t("common.status.loading")}</p>
      </div>
    );
  }

  // Active session exists — show streaming view
  if (session && (session.status === "live" || session.status === "created")) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-gray-900">{session.title}</h1>
            {session.status === "live" && (
              <span className="animate-pulse rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                LIVE
              </span>
            )}
            {session.characterName && (
              <span className="text-sm text-gray-500">{session.characterName}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {error && <span className="text-xs text-red-600">{error}</span>}
            {isAdmin && session.status === "live" && (
              <button
                type="button"
                onClick={() => void handleStop()}
                disabled={stopping}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {stopping ? "..." : t("aituber.sessions.stop")}
              </button>
            )}
            {isAdmin && (
              <Link
                href="/aituber/characters"
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {t("aituber.characters.title")}
              </Link>
            )}
          </div>
        </div>

        {/* Main stage */}
        <div className="flex-1">
          <AituberStage session={session} livekitUrl={livekitUrl} />
        </div>
      </div>
    );
  }

  // No active session
  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      {isAdmin ? (
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">{t("aituber.title")}</h1>
            <p className="mt-1 text-sm text-gray-500">{t("aituber.description")}</p>
          </div>

          {error && <p className="text-center text-sm text-red-600">{error}</p>}

          <div>
            <label htmlFor="aituber-char-select" className="mb-1 block text-sm text-gray-700">
              {t("aituber.sessions.selectCharacter")}
            </label>
            <select
              id="aituber-char-select"
              value={selectedCharId}
              onChange={(e) => setSelectedCharId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            >
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => void handleStartLive()}
            disabled={starting || !selectedCharId || characters.length === 0}
            className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {starting ? "..." : t("aituber.sessions.startLive")}
          </button>

          <div className="text-center">
            <Link href="/aituber/characters" className="text-sm text-blue-600 hover:underline">
              {t("aituber.characters.title")}
            </Link>
          </div>
        </div>
      ) : (
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">{t("aituber.title")}</h1>
          <p className="mt-4 text-gray-500">{t("aituber.sessions.noLiveStream")}</p>
        </div>
      )}
    </div>
  );
}
