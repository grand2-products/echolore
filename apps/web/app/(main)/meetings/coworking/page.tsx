"use client";

import Link from "next/link";
import { useAuthContext } from "@/lib/auth-context";
import {
  ConnectionState,
  LiveKitRoom,
  RoomAudioRenderer,
  TrackToggle,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { useEffect, useState } from "react";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";
import { fetchLiveKitToken, getLiveKitUrl } from "@/lib/livekit";

function CoworkingBody() {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
  const t = useT();

  return (
    <div className="p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t("coworking.title")}</h1>
            <p className="mt-1 text-gray-600">{t("coworking.description")}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/meetings"
              className="rounded-full bg-white px-3 py-1 text-sm text-blue-700 shadow hover:bg-blue-50"
            >
              {t("coworking.back")}
            </Link>
            <span className="rounded-full bg-white px-3 py-1 text-sm text-gray-700 shadow">
              {t("coworking.participants", { count: tracks.length })}
            </span>
            <ConnectionState className="rounded-full bg-white px-3 py-1 text-sm text-gray-700 shadow" />
          </div>
        </header>

        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">{t("coworking.cameraWall")}</h2>
          <div className="flex h-64 items-center justify-center rounded-lg bg-gray-900 text-gray-100">
            {tracks.length > 0
              ? t("coworking.cameraWallActive")
              : t("coworking.cameraWallEmpty")}
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{t("coworking.memberGrid")}</h2>
            <div className="text-sm text-gray-600">
              {t("coworking.visibleParticipants", { count: tracks.length })}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tracks.map((trackRef) => (
              <div key={trackRef.participant.identity} className="rounded-lg border border-gray-200 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">
                    {trackRef.participant.name ?? trackRef.participant.identity}
                  </div>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      trackRef.participant.isSpeaking ? "bg-green-500" : "bg-gray-300"
                    }`}
                  />
                </div>
                <div className="text-xs text-gray-500">
                  {trackRef.participant.isMicrophoneEnabled
                    ? t("coworking.micEnabled")
                    : t("coworking.micMuted")}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center gap-3">
          <TrackToggle source={Track.Source.Microphone}>{t("meetings.room.mic")}</TrackToggle>
          <TrackToggle source={Track.Source.Camera}>{t("meetings.room.camera")}</TrackToggle>
          <TrackToggle source={Track.Source.ScreenShare}>{t("meetings.room.screen")}</TrackToggle>
        </section>

        <RoomAudioRenderer />
      </div>
    </div>
  );
}

export default function CoworkingPage() {
  const { user } = useAuthContext();
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const participantIdentity =
          user?.id ?? `user-${Math.random().toString(36).slice(2, 10)}`;
        const fetched = await fetchLiveKitToken({
          roomName: "everybody-coworking",
          participantName: user?.name ?? t("coworking.guest"),
          participantIdentity,
        });
        setToken(fetched);
      } catch (err) {
        setError(getApiErrorMessage(err, t("coworking.tokenError")));
      }
    };

    void run();
  }, [getApiErrorMessage, t, user?.id, user?.name]);

  if (error) {
    return <div className="p-8 text-red-600">{error}</div>;
  }

  if (!token) {
    return <div className="p-8 text-gray-600">{t("coworking.joining")}</div>;
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={getLiveKitUrl()}
      connect={true}
      className="h-full"
      data-lk-theme="default"
    >
      <CoworkingBody />
    </LiveKitRoom>
  );
}
