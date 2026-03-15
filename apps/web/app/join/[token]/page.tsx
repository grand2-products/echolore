"use client";

import { LiveKitRoom } from "@livekit/components-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { guestApi } from "@/lib/api/meetings";
import { getLiveKitUrl } from "@/lib/livekit";
import GuestRoomBody from "./GuestRoomBody";

type PageState =
  | { step: "loading" }
  | { step: "name-entry"; meetingTitle: string; inviteLabel: string | null }
  | { step: "waiting"; meetingTitle: string; requestId: string; guestName: string }
  | {
      step: "in-room";
      meetingTitle: string;
      livekitToken: string;
      roomName: string;
      guestName: string;
    }
  | { step: "left" }
  | { step: "rejected" }
  | { step: "error"; message: string };

export default function GuestJoinPage() {
  const params = useParams();
  const token = params.token as string;
  const [state, setState] = useState<PageState>({ step: "loading" });
  const [nameInput, setNameInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step 1: Validate invite
  useEffect(() => {
    let cancelled = false;
    async function validate() {
      try {
        const result = await guestApi.validateInvite(token);
        if (!cancelled) {
          setState({
            step: "name-entry",
            meetingTitle: result.meeting.title,
            inviteLabel: result.invite.label,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            step: "error",
            message: err instanceof Error ? err.message : "招待リンクが無効です",
          });
        }
      }
    }
    void validate();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Step 2: Submit join request
  const handleSubmit = useCallback(async () => {
    if (!nameInput.trim() || submitting) return;
    if (state.step !== "name-entry") return;

    setSubmitting(true);
    try {
      const result = await guestApi.submitJoinRequest(token, nameInput.trim());
      setState({
        step: "waiting",
        meetingTitle: state.meetingTitle,
        requestId: result.requestId,
        guestName: nameInput.trim(),
      });
    } catch (err) {
      setState({
        step: "error",
        message: err instanceof Error ? err.message : "リクエスト送信に失敗しました",
      });
    } finally {
      setSubmitting(false);
    }
  }, [nameInput, submitting, state, token]);

  // Step 3: Poll for approval
  useEffect(() => {
    if (state.step !== "waiting") return;

    const { requestId, meetingTitle, guestName } = state;

    const poll = async () => {
      try {
        const result = await guestApi.checkRequestStatus(token, requestId);
        if (result.status === "approved" && result.token && result.roomName) {
          setState({
            step: "in-room",
            meetingTitle,
            livekitToken: result.token,
            roomName: result.roomName,
            guestName,
          });
        } else if (result.status === "rejected") {
          setState({ step: "rejected" });
        }
      } catch {
        // continue polling
      }
    };

    void poll();
    pollingRef.current = setInterval(poll, 2000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [state, token]);

  // Render based on state
  if (state.step === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 text-gray-400">
        <svg className="h-6 w-6 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span className="text-sm">招待を確認中...</span>
      </div>
    );
  }

  if (state.step === "error") {
    return (
      <div className="mx-4 max-w-md rounded-xl border border-red-500/30 bg-gray-900 p-8 text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
            <svg
              className="h-7 w-7 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
          </div>
        </div>
        <h2 className="mb-2 text-lg font-semibold text-white">参加できません</h2>
        <p className="text-sm text-gray-400">{state.message}</p>
      </div>
    );
  }

  if (state.step === "rejected") {
    return (
      <div className="mx-4 max-w-md rounded-xl border border-red-500/30 bg-gray-900 p-8 text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
            <svg
              className="h-7 w-7 text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>
        </div>
        <h2 className="mb-2 text-lg font-semibold text-white">参加が拒否されました</h2>
        <p className="text-sm text-gray-400">会議の主催者により参加リクエストが拒否されました。</p>
      </div>
    );
  }

  if (state.step === "left") {
    return (
      <div className="mx-4 max-w-md rounded-xl border border-gray-700 bg-gray-900 p-8 text-center">
        <h2 className="mb-2 text-lg font-semibold text-white">会議から退出しました</h2>
        <p className="text-sm text-gray-400">このタブを閉じてください。</p>
      </div>
    );
  }

  if (state.step === "name-entry") {
    return (
      <div className="mx-4 w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-8">
        <h1 className="mb-1 text-xl font-semibold text-white">{state.meetingTitle}</h1>
        {state.inviteLabel && <p className="mb-6 text-sm text-gray-400">{state.inviteLabel}</p>}
        {!state.inviteLabel && <div className="mb-6" />}
        <label htmlFor="guest-name" className="mb-2 block text-sm font-medium text-gray-300">
          表示名を入力してください
        </label>
        <input
          id="guest-name"
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSubmit();
          }}
          placeholder="名前"
          className="mb-4 w-full rounded-lg border border-gray-600 bg-gray-800 px-4 py-2.5 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          maxLength={100}
        />
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!nameInput.trim() || submitting}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "送信中..." : "参加をリクエスト"}
        </button>
      </div>
    );
  }

  if (state.step === "waiting") {
    return (
      <div className="mx-4 max-w-md rounded-xl border border-gray-700 bg-gray-900 p-8 text-center">
        <div className="mb-4 flex justify-center">
          <svg
            className="h-8 w-8 animate-spin text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
        <h2 className="mb-2 text-lg font-semibold text-white">承認を待っています</h2>
        <p className="text-sm text-gray-400">会議の参加者が承認するまでお待ちください...</p>
      </div>
    );
  }

  // state.step === "in-room"
  return (
    <div className="h-screen w-screen">
      <LiveKitRoom
        token={state.livekitToken}
        serverUrl={getLiveKitUrl()}
        connect={true}
        options={{
          dynacast: true,
          adaptiveStream: { pixelDensity: "screen" },
          publishDefaults: { simulcast: true },
        }}
        className="h-full"
        data-lk-theme="default"
      >
        <GuestRoomBody
          meetingTitle={state.meetingTitle}
          guestName={state.guestName}
          onLeave={() => setState({ step: "left" })}
        />
      </LiveKitRoom>
    </div>
  );
}
