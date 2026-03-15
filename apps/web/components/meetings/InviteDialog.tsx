"use client";

import type { MeetingInviteDto } from "@echolore/shared/contracts";
import { useCallback, useEffect, useState } from "react";
import { meetingsApi } from "@/lib/api/meetings";

interface InviteDialogProps {
  meetingId: string;
  open: boolean;
  onClose: () => void;
}

const EXPIRY_OPTIONS = [
  { label: "1時間", value: 3600 },
  { label: "6時間", value: 21600 },
  { label: "24時間", value: 86400 },
  { label: "7日間", value: 604800 },
] as const;

export default function InviteDialog({ meetingId, open, onClose }: InviteDialogProps) {
  const [invites, setInvites] = useState<MeetingInviteDto[]>([]);
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expiresIn, setExpiresIn] = useState(86400);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    try {
      const result = await meetingsApi.listInvites(meetingId);
      setInvites(result.invites);
    } catch {
      // ignore
    }
  }, [meetingId]);

  useEffect(() => {
    if (open) void loadInvites();
  }, [open, loadInvites]);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await meetingsApi.createInvite(meetingId, {
        label: label.trim() || undefined,
        maxUses: maxUses ? Number.parseInt(maxUses, 10) : undefined,
        expiresInSeconds: expiresIn,
      });
      setLabel("");
      setMaxUses("");
      await loadInvites();
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    try {
      await meetingsApi.revokeInvite(meetingId, inviteId);
      await loadInvites();
    } catch {
      // ignore
    }
  };

  const copyLink = (token: string, inviteId: string) => {
    const url = `${window.location.origin}/join/${token}`;
    void navigator.clipboard.writeText(url);
    setCopiedId(inviteId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!open) return null;

  const activeInvites = invites.filter((i) => !i.revokedAt);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="mx-4 w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">ゲスト招待</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Create invite form */}
        <div className="space-y-3 border-b border-gray-700 px-6 py-4">
          <div>
            <label htmlFor="invite-label" className="mb-1 block text-xs font-medium text-gray-400">
              ラベル（任意）
            </label>
            <input
              id="invite-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例: クライアントチーム用"
              className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="invite-max" className="mb-1 block text-xs font-medium text-gray-400">
                使用回数上限（任意）
              </label>
              <input
                id="invite-max"
                type="number"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="無制限"
                min="1"
                max="1000"
                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label
                htmlFor="invite-expiry"
                className="mb-1 block text-xs font-medium text-gray-400"
              >
                有効期限
              </label>
              <select
                id="invite-expiry"
                value={expiresIn}
                onChange={(e) => setExpiresIn(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                {EXPIRY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {creating ? "作成中..." : "招待リンクを作成"}
          </button>
        </div>

        {/* Active invites list */}
        <div className="max-h-64 overflow-y-auto px-6 py-4">
          {activeInvites.length === 0 ? (
            <p className="text-center text-sm text-gray-500">招待リンクはまだありません</p>
          ) : (
            <div className="space-y-2">
              {activeInvites.map((invite) => {
                const isExpired = new Date(invite.expiresAt) < new Date();
                const isFull = invite.maxUses !== null && invite.useCount >= invite.maxUses;
                return (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm text-white">
                          {invite.label || "招待リンク"}
                        </span>
                        {isExpired && (
                          <span className="rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[10px] text-yellow-400">
                            期限切れ
                          </span>
                        )}
                        {isFull && (
                          <span className="rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[10px] text-orange-400">
                            満員
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        使用: {invite.useCount}
                        {invite.maxUses !== null ? `/${invite.maxUses}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!isExpired && !isFull && (
                        <button
                          type="button"
                          onClick={() => copyLink(invite.token, invite.id)}
                          className="rounded-md px-2 py-1 text-xs text-blue-400 hover:bg-gray-700"
                        >
                          {copiedId === invite.id ? "コピー済み" : "コピー"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleRevoke(invite.id)}
                        className="rounded-md px-2 py-1 text-xs text-red-400 hover:bg-gray-700"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
