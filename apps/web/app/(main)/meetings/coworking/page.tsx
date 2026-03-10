"use client";

import {
  ConnectionState,
  LiveKitRoom,
  RoomAudioRenderer,
  TrackToggle,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { useEffect, useState } from "react";
import { fetchLiveKitToken, getLiveKitUrl } from "@/lib/livekit";

function CoworkingBody() {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);

  return (
    <div className="p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Everybody Coworking</h1>
            <p className="mt-1 text-gray-600">全社員の在席状況と顔をリアルタイム表示</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-white px-3 py-1 text-sm text-gray-700 shadow">
              接続: {tracks.length}名
            </span>
            <ConnectionState className="rounded-full bg-white px-3 py-1 text-sm text-gray-700 shadow" />
          </div>
        </header>

        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">オフィスカメラ（大画面）</h2>
          <div className="flex h-64 items-center justify-center rounded-lg bg-gray-900 text-gray-100">
            {tracks.length > 0 ? "接続中の映像トラックあり" : "映像参加者待機中"}
          </div>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">メンバーグリッド</h2>
            <div className="text-sm text-gray-600">同時表示: {tracks.length}名</div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tracks.map((trackRef) => (
              <div key={trackRef.participant.identity} className="rounded-lg border border-gray-200 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">
                    {trackRef.participant.name ?? trackRef.participant.identity}
                  </div>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${trackRef.participant.isSpeaking ? "bg-green-500" : "bg-gray-300"}`}
                  />
                </div>
                <div className="text-xs text-gray-500">
                  {trackRef.participant.isMicrophoneEnabled ? "🎙️ ミュート解除" : "🔇 ミュート中"}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center gap-3">
          <TrackToggle source={Track.Source.Microphone}>マイク</TrackToggle>
          <TrackToggle source={Track.Source.Camera}>カメラ</TrackToggle>
          <TrackToggle source={Track.Source.ScreenShare}>画面共有</TrackToggle>
        </section>

        <RoomAudioRenderer />
      </div>
    </div>
  );
}

export default function CoworkingPage() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const participantIdentity = `user-${Math.random().toString(36).slice(2, 10)}`;
        const fetched = await fetchLiveKitToken({
          roomName: "everybody-coworking",
          participantName: "ゲストユーザー",
          participantIdentity,
        });
        setToken(fetched);
      } catch (err) {
        setError(err instanceof Error ? err.message : "LiveKitトークンの取得に失敗しました");
      }
    };

    void run();
  }, []);

  if (error) {
    return <div className="p-8 text-red-600">{error}</div>;
  }

  if (!token) {
    return <div className="p-8 text-gray-600">接続準備中...</div>;
  }

  return (
    <LiveKitRoom token={token} serverUrl={getLiveKitUrl()} connect={true} className="h-full" data-lk-theme="default">
      <CoworkingBody />
    </LiveKitRoom>
  );
}
