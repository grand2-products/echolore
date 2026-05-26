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

export function getInstanceId(): string {
  return instanceId;
}

/**
 * Try to acquire or renew leadership for the autonomous evaluator (G5).
 * Returns true if this instance may run the evaluation this round.
 *
 * Uses Valkey `SET key val PX ttl NX` for the lock, refreshing the TTL when we
 * already hold it. If Valkey is unavailable, degrades to `true` so
 * single-instance / dev deployments keep working — matching the
 * graceful-degradation pattern in lib/valkey.ts. With multiple replicas and a
 * reachable Valkey, only the lock holder returns true, so the loop runs once
 * cluster-wide.
 */
export async function tryAcquireLeadership(ttlMs: number = LEADER_TTL_MS): Promise<boolean> {
  const valkey = getValkey();
  if (!valkey) return true;

  try {
    const acquired = await valkey.set(LEADER_KEY, instanceId, "PX", ttlMs, "NX");
    if (acquired === "OK") {
      return true;
    }

    // Lock is held by someone — refresh the TTL only if it is us.
    const current = await valkey.get(LEADER_KEY);
    if (current === instanceId) {
      await valkey.set(LEADER_KEY, instanceId, "PX", ttlMs);
      return true;
    }

    return false;
  } catch {
    // Valkey error → degrade to local execution rather than stalling everyone.
    return true;
  }
}

/** Release leadership if this instance holds it, to speed up failover on shutdown. */
export async function releaseLeadership(): Promise<void> {
  const valkey = getValkey();
  if (!valkey) return;

  try {
    const current = await valkey.get(LEADER_KEY);
    if (current === instanceId) {
      await valkey.del(LEADER_KEY);
    }
  } catch {
    // ignore teardown errors
  }
}
