"use client";

import type { GuestRequestDataChannelMessage } from "@echolore/shared/contracts";
import { useDataChannel } from "@livekit/components-react";
import { useCallback, useRef, useState } from "react";
import { meetingsApi } from "@/lib/api/meetings";

interface PendingRequest {
  requestId: string;
  guestName: string;
}

interface GuestApprovalBannerProps {
  meetingId: string;
}

export default function GuestApprovalBanner({ meetingId }: GuestApprovalBannerProps) {
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [processing, setProcessing] = useState<Set<string>>(new Set());
  const decoderRef = useRef(new TextDecoder());

  const onMessage = useCallback((msg: { payload: Uint8Array; topic?: string }) => {
    if (msg.topic !== "guest-request") return;
    try {
      const parsed: GuestRequestDataChannelMessage = JSON.parse(
        decoderRef.current.decode(msg.payload)
      );

      if (parsed.type === "guest-request-new" && parsed.guestName) {
        const name = parsed.guestName;
        setPendingRequests((prev) => {
          if (prev.some((r) => r.requestId === parsed.requestId)) return prev;
          return [...prev, { requestId: parsed.requestId, guestName: name }];
        });
      } else if (parsed.type === "guest-request-resolved") {
        setPendingRequests((prev) => prev.filter((r) => r.requestId !== parsed.requestId));
      }
    } catch {
      // ignore
    }
  }, []);

  useDataChannel("guest-request", onMessage);

  const handleApprove = useCallback(
    async (requestId: string) => {
      setProcessing((prev) => new Set(prev).add(requestId));
      try {
        await meetingsApi.approveGuestRequest(meetingId, requestId);
        setPendingRequests((prev) => prev.filter((r) => r.requestId !== requestId));
      } catch {
        // ignore
      } finally {
        setProcessing((prev) => {
          const next = new Set(prev);
          next.delete(requestId);
          return next;
        });
      }
    },
    [meetingId]
  );

  const handleReject = useCallback(
    async (requestId: string) => {
      setProcessing((prev) => new Set(prev).add(requestId));
      try {
        await meetingsApi.rejectGuestRequest(meetingId, requestId);
        setPendingRequests((prev) => prev.filter((r) => r.requestId !== requestId));
      } catch {
        // ignore
      } finally {
        setProcessing((prev) => {
          const next = new Set(prev);
          next.delete(requestId);
          return next;
        });
      }
    },
    [meetingId]
  );

  if (pendingRequests.length === 0) return null;

  return (
    <div className="space-y-2 border-b border-blue-500/20 bg-blue-500/10 px-4 py-2">
      {pendingRequests.map((request) => {
        const isProcessing = processing.has(request.requestId);
        return (
          <div key={request.requestId} className="flex items-center justify-between">
            <span className="text-sm text-blue-200">
              <strong>{request.guestName}</strong> さんが参加を希望しています
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleApprove(request.requestId)}
                disabled={isProcessing}
                className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-green-500 disabled:opacity-50"
              >
                承認
              </button>
              <button
                type="button"
                onClick={() => void handleReject(request.requestId)}
                disabled={isProcessing}
                className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                拒否
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
