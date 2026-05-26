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
  if (!valkey) return true;

  try {
    const result = await valkey.eval(
      ACQUIRE_OR_RENEW_LUA,
      1,
      LEADER_KEY,
      instanceId,
      String(ttlMs)
    );
    return result === 1;
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
    await valkey.eval(RELEASE_LUA, 1, LEADER_KEY, instanceId);
  } catch {
    // ignore teardown errors
  }
}
