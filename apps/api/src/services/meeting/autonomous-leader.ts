import { randomUUID } from "node:crypto";
import { getValkey } from "../../lib/valkey.js";

const LEADER_KEY = "echolore:autonomous-eval:leader";
// Lock TTL. Must comfortably exceed the renewal cadence (evaluation runs at
// least every DEFAULT_INTERVAL_MS = 60s) so the leader keeps the lock between
// rounds, while still being short enough that a crashed leader is replaced
// within ~one interval.
const LEADER_TTL_MS = 90_000;

// Unique per process; identifies this API replica as the lock holder.
const instanceId = randomUUID();

// Track whether this instance considered itself the leader on the previous
// call, so we only log on edges (acquired / lost / acquire-failed) instead of
// every renewal tick.
let wasLeader = false;

// Atomically acquire (when free) or renew (when already held by us) the leader
// lock. Running it as a single Redis script removes the GET→SET race window of
// a check-then-set in app code, so two replicas can never both treat
// themselves as leader. Returns 1 when we are the leader, 0 otherwise.
const ACQUIRE_OR_RENEW_LUA = `
local current = redis.call('get', KEYS[1])
if current == false or current == ARGV[1] then
  redis.call('set', KEYS[1], ARGV[1], 'PX', tonumber(ARGV[2]))
  return 1
end
return 0
`;

// Atomically release the lock only if we still hold it, so we never delete
// another instance's freshly-acquired lock.
const RELEASE_LUA = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`;

/**
 * H3: emit a structured log line. We don't pull in a logger framework just
 * for this; one JSON object per line is grep-friendly and works with the
 * existing stdout-based log pipeline.
 */
function logLeaderEvent(event: string, fields: Record<string, unknown>): void {
  try {
    console.log(
      JSON.stringify({
        event,
        instanceId,
        lockKey: LEADER_KEY,
        ...fields,
      })
    );
  } catch {
    // never let logging crash the caller (e.g. circular value in fields)
  }
}

export function getInstanceId(): string {
  return instanceId;
}

/**
 * Try to acquire or renew leadership for the autonomous evaluator (G5).
 * Returns true if this instance may run the evaluation this round.
 *
 * If Valkey is unavailable, degrades to `true` so single-instance / dev
 * deployments keep working — matching the graceful-degradation pattern in
 * lib/valkey.ts. CAVEAT: when Valkey is *down* in a multi-replica deployment,
 * every replica falls through to `true` and they all run the evaluation. The
 * DB-persisted cooldown and per-session eval cursor bound repeated
 * interventions, but simultaneous same-round firing across replicas is possible
 * while Valkey is unreachable (availability favoured over strict single-firing).
 */
export async function tryAcquireLeadership(ttlMs: number = LEADER_TTL_MS): Promise<boolean> {
  const valkey = getValkey();
  if (!valkey) {
    if (!wasLeader) {
      logLeaderEvent("meeting-leader.acquired", { mode: "no-valkey", ttlMs });
      wasLeader = true;
    }
    return true;
  }

  try {
    const result = await valkey.eval(
      ACQUIRE_OR_RENEW_LUA,
      1,
      LEADER_KEY,
      instanceId,
      String(ttlMs)
    );
    const isLeader = result === 1;
    if (isLeader && !wasLeader) {
      logLeaderEvent("meeting-leader.acquired", { mode: "valkey", ttlMs });
      wasLeader = true;
    } else if (!isLeader && wasLeader) {
      logLeaderEvent("meeting-leader.lost", { ttlMs });
      wasLeader = false;
    } else if (!isLeader) {
      // First-time / steady-state follower — log so we can observe which
      // instance is currently the leader from the loser side.
      logLeaderEvent("meeting-leader.acquire-failed", { ttlMs });
    }
    // (When `isLeader && wasLeader` it's a renewal — kept quiet on purpose.)
    return isLeader;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logLeaderEvent("meeting-leader.acquire-error", { ttlMs, error: message });
    // Valkey error → degrade to local execution rather than stalling everyone.
    // Mark ourselves as leader so a recovery transition is logged correctly.
    wasLeader = true;
    return true;
  }
}

/** Release leadership if this instance holds it, to speed up failover on shutdown. */
export async function releaseLeadership(): Promise<void> {
  const valkey = getValkey();
  if (!valkey) {
    if (wasLeader) {
      logLeaderEvent("meeting-leader.released", { mode: "no-valkey" });
      wasLeader = false;
    }
    return;
  }

  try {
    await valkey.eval(RELEASE_LUA, 1, LEADER_KEY, instanceId);
    if (wasLeader) {
      logLeaderEvent("meeting-leader.released", { mode: "valkey" });
      wasLeader = false;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logLeaderEvent("meeting-leader.release-error", { error: message });
    wasLeader = false;
  }
}

/**
 * Test-only hook: reset the cached `wasLeader` flag so transitions can be
 * exercised independently across cases. Not exported from the package index.
 */
export function __resetLeaderStateForTests(): void {
  wasLeader = false;
}
