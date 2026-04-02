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
      <div className="flex h-full items-center justify-center bg-gray-950 p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-indigo-400" />
      </div>
    );
  }

  // Active session exists — show streaming view
  if (session && (session.status === "live" || session.status === "created")) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col bg-gray-950">
        {/* Header — dark translucent */}
        <div className="flex items-center justify-between border-b border-white/10 bg-gray-900/95 px-4 py-2 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-gray-100">{session.title}</h1>
            {session.status === "live" && (
              <span className="rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-bold text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.4)]">
                LIVE
              </span>
            )}
            {session.characterName && (
              <span className="text-sm text-gray-400">{session.characterName}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {error && <span className="text-xs text-red-400">{error}</span>}
            {isAdmin && session.status === "live" && (
              <button
                type="button"
                onClick={() => void handleStop()}
                disabled={stopping}
                className="rounded-lg bg-red-600/80 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {stopping ? "..." : t("aituber.sessions.stop")}
              </button>
            )}
            {isAdmin && (
              <Link
                href="/aituber/characters"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-300 hover:bg-white/10"
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
    <div className="flex h-full flex-col items-center justify-center bg-gray-950 p-8">
      {isAdmin ? (
        <div className="w-full max-w-lg space-y-8">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10">
              <svg
                className="h-8 w-8 text-indigo-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-100">{t("aituber.title")}</h1>
            <p className="mt-2 text-sm text-gray-400">{t("aituber.description")}</p>
          </div>

          {error && <p className="text-center text-sm text-red-400">{error}</p>}

          {/* Character cards */}
          <div>
            <p className="mb-3 text-sm font-medium text-gray-400">
              {t("aituber.sessions.selectCharacter")}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {characters.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCharId(c.id)}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    selectedCharId === c.id
                      ? "border-indigo-500 bg-indigo-500/10 shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                      : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
                  }`}
                >
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-500/30">
                    <span className="text-lg text-indigo-300">{c.name.charAt(0)}</span>
                  </div>
                  <p className="truncate text-sm font-medium text-gray-200">{c.name}</p>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleStartLive()}
            disabled={starting || !selectedCharId || characters.length === 0}
            className="w-full rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-green-500/20 transition-all hover:from-green-400 hover:to-emerald-500 hover:shadow-green-500/30 disabled:opacity-40 disabled:shadow-none"
          >
            {starting ? "..." : t("aituber.sessions.startLive")}
          </button>

          <div className="text-center">
            <Link href="/aituber/characters" className="text-sm text-gray-500 hover:text-gray-300">
              {t("aituber.characters.title")}
            </Link>
          </div>
        </div>
      ) : (
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-white/5">
            <svg
              className="h-10 w-10 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-100">{t("aituber.title")}</h1>
          <p className="mt-3 text-gray-500">{t("aituber.sessions.noLiveStream")}</p>
        </div>
      )}
    </div>
  );
}
