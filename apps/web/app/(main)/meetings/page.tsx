"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCreateMeetingMutation, useMeetingsQuery, type Meeting, meetingsApi } from "@/lib/api";

export default function MeetingsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState("");
  const [runningMeetingId, setRunningMeetingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data, isLoading: loading, error, refetch } = useMeetingsQuery();
  const createMeetingMutation = useCreateMeetingMutation();

  const meetings = useMemo(
    () =>
      (data?.meetings ?? []).map((m) => ({
        ...m,
        createdAtLabel: new Date(m.createdAt).toLocaleString("ja-JP"),
      })),
    [data?.meetings],
  );

  const handleCreateMeeting = async () => {
    if (!newMeetingTitle.trim()) return;

    await createMeetingMutation.mutateAsync({
      title: newMeetingTitle,
    });

    setShowCreateModal(false);
    setNewMeetingTitle("");
    setMessage("ミーティングを作成しました。");
  };

  const runRoomAi = async (meetingId: string) => {
    try {
      setRunningMeetingId(meetingId);
      setMessage(null);
      const result = await meetingsApi.runRoomAiPipeline(meetingId);
      setMessage(`AI要約を作成し、Wikiページを保存しました: ${result.wikiPage.title}`);
      await refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AIパイプライン実行に失敗しました。";
      setMessage(msg);
    } finally {
      setRunningMeetingId(null);
    }
  };

  const getStatusBadge = (status: Meeting["status"]) => {
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            <span className="mr-1.5 h-2 w-2 animate-pulse rounded-full bg-green-500" />
            Active
          </span>
        );
      case "scheduled":
        return (
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
            Scheduled
          </span>
        );
      case "ended":
        return (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
            Ended
          </span>
        );
    }
  };

  return (
    <div className="p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Meetings</h1>
            <p className="mt-1 text-gray-600">Run Room AI MVP: transcript -&gt; summary -&gt; Wiki</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/meetings/coworking" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-blue-700 hover:bg-blue-100">
              Go Coworking
            </Link>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              + New Meeting
            </button>
          </div>
        </div>

        {message && <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">{message}</div>}

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error instanceof Error ? error.message : "Failed to load meetings"}
          </div>
        )}

        {loading && <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">Loading...</div>}

        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="font-semibold text-gray-900">Meeting List</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {meetings.map((meeting) => (
              <div key={meeting.id} className="flex items-center justify-between gap-4 p-4 hover:bg-gray-50">
                <div>
                  <h3 className="font-medium text-gray-900">{meeting.title}</h3>
                  <p className="text-sm text-gray-500">
                    {meeting.creatorId} - {meeting.createdAtLabel}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(meeting.status)}
                  <button
                    type="button"
                    onClick={() => runRoomAi(meeting.id)}
                    disabled={runningMeetingId === meeting.id}
                    className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
                  >
                    {runningMeetingId === meeting.id ? "Running..." : "AI要約→Wiki"}
                  </button>
                  <Link
                    href={`/meetings/${meeting.id}`}
                    className={`rounded-lg px-4 py-2 text-sm font-medium ${
                      meeting.status === "active"
                        ? "bg-green-600 text-white hover:bg-green-700"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                  >
                    {meeting.status === "active" ? "Join" : "Open"}
                  </Link>
                </div>
              </div>
            ))}
            {!loading && meetings.length === 0 && <div className="p-6 text-center text-sm text-gray-500">No meetings yet.</div>}
          </div>
        </div>

        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">Create Meeting</h2>
              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
                <input
                  type="text"
                  value={newMeetingTitle}
                  onChange={(e) => setNewMeetingTitle(e.target.value)}
                  placeholder="Enter meeting title"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button type="button" onClick={handleCreateMeeting} className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
