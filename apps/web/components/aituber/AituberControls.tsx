"use client";

import type { AituberSessionDto } from "@echolore/shared/contracts";
import { useState } from "react";
import { aituberApi } from "@/lib/api/aituber";
import { useT } from "@/lib/i18n";

interface AituberControlsProps {
  session: AituberSessionDto;
  isCreator: boolean;
  onSessionUpdate: (session: AituberSessionDto) => void;
}

export function AituberControls({ session, isCreator, onSessionUpdate }: AituberControlsProps) {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isCreator) return null;

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const { session: updated } = await aituberApi.startSession(session.id);
      onSessionUpdate(updated);
    } catch {
      setError(t("aituber.sessions.startError"));
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    setError(null);
    try {
      const { session: updated } = await aituberApi.stopSession(session.id);
      onSessionUpdate(updated);
    } catch {
      setError(t("aituber.sessions.stopError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-xs text-red-600">{error}</span>}

      {session.status === "created" && (
        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={loading}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? "..." : t("aituber.sessions.start")}
        </button>
      )}

      {session.status === "live" && (
        <button
          type="button"
          onClick={() => void handleStop()}
          disabled={loading}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? "..." : t("aituber.sessions.stop")}
        </button>
      )}
    </div>
  );
}
