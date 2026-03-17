"use client";

import type { AituberSessionDto } from "@echolore/shared/contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AituberControls } from "@/components/aituber/AituberControls";
import { AituberStage } from "@/components/aituber/AituberStage";
import { aituberApi } from "@/lib/api/aituber";
import { useAuthContext } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";

export default function AituberSessionPage() {
  const t = useT();
  const params = useParams();
  const sessionId = params.id as string;
  const { user } = useAuthContext();

  const [session, setSession] = useState<AituberSessionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://localhost:7880";

  useEffect(() => {
    const load = async () => {
      try {
        const { session: s } = await aituberApi.getSession(sessionId);
        setSession(s);
      } catch {
        setError(t("aituber.sessions.loadError"));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [sessionId, t]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-gray-500">{t("common.status.loading")}</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-red-600">{error || "Session not found"}</p>
        <Link href="/aituber" className="text-sm text-blue-600 hover:underline">
          {t("aituber.title")}
        </Link>
      </div>
    );
  }

  const isCreator = user?.id === session.creatorId;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
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
          <h1 className="text-lg font-semibold text-gray-900">{session.title}</h1>
          {session.status === "live" && (
            <span className="animate-pulse rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
              LIVE
            </span>
          )}
        </div>
        <AituberControls session={session} isCreator={isCreator} onSessionUpdate={setSession} />
      </div>

      {/* Main stage */}
      <div className="flex-1">
        <AituberStage session={session} livekitUrl={livekitUrl} />
      </div>
    </div>
  );
}
