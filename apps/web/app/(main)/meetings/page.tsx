"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCreateMeetingMutation, useMeetingsQuery, type Meeting } from "@/lib/api";

export default function MeetingsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState("");

  const {
    data,
    isLoading: loading,
    error,
  } = useMeetingsQuery();

  const createMeetingMutation = useCreateMeetingMutation();

  const meetings = useMemo(
    () =>
      (data?.meetings ?? []).map((m) => ({
        ...m,
        createdAt: new Date(m.createdAt).toLocaleString("ja-JP"),
      })),
    [data?.meetings],
  );

  const handleCreateMeeting = async () => {
    if (!newMeetingTitle.trim()) return;

    await createMeetingMutation.mutateAsync({
      title: newMeetingTitle,
      creatorId: "demo-user",
    });

    setShowCreateModal(false);
    setNewMeetingTitle("");
  };

  const getStatusBadge = (status: Meeting["status"]) => {
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            <span className="mr-1.5 h-2 w-2 animate-pulse rounded-full bg-green-500" />
            開催中
          </span>
        );
      case "scheduled":
        return (
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
            予定
          </span>
        );
      case "ended":
        return (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
            終了
          </span>
        );
    }
  };

  return (
    <div className="p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">ビデオ会議</h1>
            <p className="mt-1 text-gray-600">
              Everybody Coworking / Room モードでリアルタイムコミュニケーション
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/meetings/coworking"
              className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-blue-700 hover:bg-blue-100"
            >
              Coworkingへ
            </Link>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              + 新規ミーティング
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error instanceof Error ? error.message : "ミーティングの取得に失敗しました"}
          </div>
        )}

        {loading && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
            読み込み中...
          </div>
        )}

        {!loading && meetings.some((m) => m.status === "active") && (
          <div className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">開催中のミーティング</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {meetings
                .filter((m) => m.status === "active")
                .map((meeting) => (
                  <div key={meeting.id} className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <div className="mb-2 flex items-start justify-between">
                      <h3 className="font-semibold text-gray-900">{meeting.title}</h3>
                      {getStatusBadge(meeting.status)}
                    </div>
                    <p className="mb-3 text-sm text-gray-600">
                      作成者: {meeting.creatorId}
                    </p>
                    <Link
                      href={`/meetings/${meeting.id}`}
                      className="inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                    >
                      参加する
                    </Link>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="font-semibold text-gray-900">すべてのミーティング</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {meetings.map((meeting) => (
              <div key={meeting.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                    🎥
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{meeting.title}</h3>
                    <p className="text-sm text-gray-500">
                      {meeting.creatorId} • {meeting.createdAt}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {getStatusBadge(meeting.status)}
                  {meeting.status !== "ended" && (
                    <Link
                      href={`/meetings/${meeting.id}`}
                      className={`rounded-lg px-4 py-2 text-sm font-medium ${
                        meeting.status === "active"
                          ? "bg-green-600 text-white hover:bg-green-700"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {meeting.status === "active" ? "参加" : "開始"}
                    </Link>
                  )}
                </div>
              </div>
            ))}
            {!loading && meetings.length === 0 && (
              <div className="p-6 text-center text-sm text-gray-500">
                ミーティングがまだありません
              </div>
            )}
          </div>
        </div>

        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">新規ミーティング作成</h2>
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">ミーティング名</label>
                <input
                  type="text"
                  value={newMeetingTitle}
                  onChange={(e) => setNewMeetingTitle(e.target.value)}
                  placeholder="ミーティング名を入力"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleCreateMeeting}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                  作成
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

