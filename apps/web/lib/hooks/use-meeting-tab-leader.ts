"use client";

import { useEffect, useState } from "react";

/**
 * M5: Per-tab exclusion for the meeting agent bot connection.
 *
 * The agent participant has a single deterministic LiveKit identity
 * (`agent-{meetingId}-{agentId}`). If the meeting creator opens the same
 * meeting in two browser tabs, both tabs would race to connect that identity
 * and LiveKit evicts the older connection — leading to dropped audio publishes
 * and flapping presence. We pick exactly one tab as the "leader" per meeting
 * via BroadcastChannel; non-leader tabs simply skip the bot connection. The
 * UI for non-leader tabs still works (they hear the agent through the leader
 * tab's published audio track like every other remote participant).
 *
 * BroadcastChannel is supported in all modern browsers. When absent (older
 * browsers / unusual environments) we fall back to "always leader" so a
 * single tab still works.
 */

const LEADER_PING_INTERVAL_MS = 1_500;
// If we haven't seen a ping from the current leader for this long, assume the
// leader tab was closed / crashed and take over.
const LEADER_TIMEOUT_MS = 4_000;

interface LeaderMessage {
  type: "claim" | "ping" | "release";
  tabId: string;
  ts: number;
}

function generateTabId(): string {
  // Math.random is fine — collisions across simultaneous tabs are vanishingly
  // unlikely and a duplicate ID would just lose the election to itself.
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useMeetingTabLeader(meetingId: string | null | undefined): boolean {
  const [isLeader, setIsLeader] = useState(false);

  useEffect(() => {
    if (!meetingId) {
      setIsLeader(false);
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    // BroadcastChannel availability check — without it, become leader so the
    // single-tab case keeps working.
    if (typeof BroadcastChannel === "undefined") {
      setIsLeader(true);
      return;
    }

    const tabId = generateTabId();
    const channel = new BroadcastChannel(`echolore.meeting-tab-leader:${meetingId}`);
    let leaderTabId: string | null = null;
    let lastLeaderPingAt = 0;
    let cancelled = false;
    let leadership = false;
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    const setLeadership = (next: boolean) => {
      if (leadership === next) return;
      leadership = next;
      if (!cancelled) setIsLeader(next);
    };

    const claimLeadership = () => {
      leaderTabId = tabId;
      lastLeaderPingAt = Date.now();
      setLeadership(true);
      channel.postMessage({ type: "claim", tabId, ts: Date.now() } satisfies LeaderMessage);
    };

    const sendPing = () => {
      if (leadership) {
        channel.postMessage({ type: "ping", tabId, ts: Date.now() } satisfies LeaderMessage);
      } else if (leaderTabId === null || Date.now() - lastLeaderPingAt > LEADER_TIMEOUT_MS) {
        // No incumbent or incumbent timed out → take over.
        claimLeadership();
      }
    };

    channel.onmessage = (event: MessageEvent<LeaderMessage>) => {
      const msg = event.data;
      if (!msg || typeof msg.tabId !== "string") return;
      if (msg.type === "claim") {
        // Deterministic tie-break: lexicographically smaller tab id wins. If
        // someone with a smaller id claims, we yield. Otherwise we re-assert.
        if (leadership) {
          if (msg.tabId < tabId) {
            setLeadership(false);
            leaderTabId = msg.tabId;
            lastLeaderPingAt = msg.ts;
          } else {
            // Re-broadcast our claim so the newcomer sees us.
            channel.postMessage({ type: "claim", tabId, ts: Date.now() } satisfies LeaderMessage);
          }
        } else {
          leaderTabId = msg.tabId;
          lastLeaderPingAt = msg.ts;
        }
      } else if (msg.type === "ping") {
        if (msg.tabId === tabId) return;
        if (!leadership) {
          leaderTabId = msg.tabId;
          lastLeaderPingAt = msg.ts;
        } else if (msg.tabId < tabId) {
          // A smaller-id leader exists — yield to them.
          setLeadership(false);
          leaderTabId = msg.tabId;
          lastLeaderPingAt = msg.ts;
        }
      } else if (msg.type === "release" && msg.tabId === leaderTabId) {
        leaderTabId = null;
        lastLeaderPingAt = 0;
        // Don't claim immediately; let sendPing's next tick handle it so all
        // tabs converge on the smallest-id rule.
      }
    };

    // Bootstrap: announce ourselves, then take leadership after a short
    // settling delay if nobody else has claimed.
    channel.postMessage({ type: "claim", tabId, ts: Date.now() } satisfies LeaderMessage);
    const bootstrap = setTimeout(() => {
      if (cancelled) return;
      if (leaderTabId === null || leaderTabId === tabId) {
        claimLeadership();
      }
    }, 250);

    pingTimer = setInterval(sendPing, LEADER_PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(bootstrap);
      if (pingTimer) clearInterval(pingTimer);
      if (leadership) {
        try {
          channel.postMessage({ type: "release", tabId, ts: Date.now() } satisfies LeaderMessage);
        } catch {
          // ignore — closing channel anyway
        }
      }
      channel.close();
    };
  }, [meetingId]);

  return isLeader;
}
