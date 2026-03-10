"use client";

import {
  ConnectionState,
  LiveKitRoom,
  RoomAudioRenderer,
  TrackToggle,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { fetchLiveKitToken, getLiveKitUrl } from "@/lib/livekit";

function RoomBody() {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);

  return (
    <div className="flex h-full flex-col bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-3">
        <Link href="/meetings" className="text-gray-300 hover:text-white">
          ← 戻る
        </Link>
        <div className="flex items-center gap-3">
          <ConnectionState className="rounded-full bg-gray-700 px-3 py-1 text-sm text-gray-100" />
          <span className="text-sm text-gray-300">参加者: {tracks.length}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tracks.map((trackRef) => (
            <div key={trackRef.participant.identity} className="rounded-lg border border-gray-700 bg-gray-800 p-4 text-white">
              <div className="font-medium">{trackRef.participant.name ?? trackRef.participant.identity}</div>
              <div className="mt-1 text-xs text-gray-300">
                {trackRef.participant.isMicrophoneEnabled ? "🎙️ ミュート解除" : "🔇 ミュート中"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 border-t border-gray-700 bg-gray-800 p-4">
        <TrackToggle source={Track.Source.Microphone}>マイク</TrackToggle>
        <TrackToggle source={Track.Source.Camera}>カメラ</TrackToggle>
        <TrackToggle source={Track.Source.ScreenShare}>画面共有</TrackToggle>
      </div>

      <RoomAudioRenderer />
    </div>
  );
}

export default function MeetingRoomPage() {
  const params = useParams();
  const meetingId = params.id as string;
  const [title, setTitle] = useState<string>(meetingId);
  const [roomName, setRoomName] = useState<string>(meetingId);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const detail = await apiFetch<{ meeting: { title: string; roomName: string } }>(`/api/meetings/${meetingId}`);
        setTitle(detail.meeting.title);
        setRoomName(detail.meeting.roomName);

        const participantIdentity = `user-${Math.random().toString(36).slice(2, 10)}`;
        const fetched = await fetchLiveKitToken({
          roomName: detail.meeting.roomName,
          participantName: "ゲストユーザー",
          participantIdentity,
        });
        setToken(fetched);
      } catch (err) {
        setError(err instanceof Error ? err.message : "会議情報またはトークン取得に失敗しました");
      }
    };

    void run();
  }, [meetingId]);

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!token) return <div className="p-8 text-gray-600">{title} ({roomName}) に接続準備中...</div>;

  return (
    <LiveKitRoom token={token} serverUrl={getLiveKitUrl()} connect={true} className="h-full" data-lk-theme="default">
      <RoomBody />
    </LiveKitRoom>
  );
}
