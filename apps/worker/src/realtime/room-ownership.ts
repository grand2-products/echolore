/**
 * HA-safe per-room ownership for the realtime worker.
 *
 * Two realtime workers attaching to the same LiveKit room produce duplicate
 * transcript segments (each has a different `sessionId`, so the API's idempotent
 * segmentKey upserts don't dedupe across them). To prevent this, every worker
 * tries `SET NX EX` on a per-room key before opening a session. The lock is
 * refreshed periodically while the session is active, and released on stop.
 *
 * This is intentionally minimal — there is no fencing token. A short network
 * partition followed by lock expiry is acceptable: the second worker takes
 * over, and dropped segments will be filled in by the audio-file fallback if
 * configured. Fencing is tracked in follow-up issue (see PR body).
 */

export interface RoomOwnership {
  /** Try to acquire exclusive ownership of `roomName`. Returns true on success. */
  acquire(roomName: string): Promise<boolean>;
  /** Best-effort refresh; returns false if the lock is no longer ours. */
  refresh(roomName: string): Promise<boolean>;
  /** Release the lock. Idempotent. */
  release(roomName: string): Promise<void>;
  /** Free any underlying resources. */
  close(): Promise<void>;
}

export interface ValkeyRoomOwnershipOptions {
  redisUrl: string;
  /** Identifier of this worker; used as the lock value. */
  workerId: string;
  /** Lock TTL. Must be longer than `refreshIntervalMs`. */
  lockTtlMs?: number;
  /** Key prefix; defaults to "realtime:room-lock:". */
  keyPrefix?: string;
}

// Atomic compare-and-delete via Lua: release only if the lock value matches.
const RELEASE_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

// Atomic compare-and-extend via Lua: refresh only if the lock value matches.
const REFRESH_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
else
  return 0
end
`;

interface MinimalRedis {
  set(key: string, value: string, mode: "PX", pxMs: number, flag: "NX"): Promise<"OK" | null>;
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
  quit(): Promise<unknown>;
}

/** Build the Valkey-backed registry. Imports `ioredis` lazily. */
export async function createValkeyRoomOwnership(
  options: ValkeyRoomOwnershipOptions
): Promise<RoomOwnership> {
  const { default: Redis } = await import("ioredis");
  const client = new Redis(options.redisUrl, { lazyConnect: false }) as unknown as MinimalRedis;
  return buildOwnership(client, options);
}

/** Exposed for unit tests; accepts an injected client matching the minimal API. */
export function buildOwnership(
  client: MinimalRedis,
  options: Omit<ValkeyRoomOwnershipOptions, "redisUrl">
): RoomOwnership {
  const prefix = options.keyPrefix ?? "realtime:room-lock:";
  const ttlMs = options.lockTtlMs ?? 30_000;
  const workerId = options.workerId;
  const keyOf = (roomName: string) => `${prefix}${roomName}`;

  return {
    async acquire(roomName) {
      const result = await client.set(keyOf(roomName), workerId, "PX", ttlMs, "NX");
      return result === "OK";
    },
    async refresh(roomName) {
      const result = await client.eval(REFRESH_LUA, 1, keyOf(roomName), workerId, ttlMs);
      return Number(result) === 1;
    },
    async release(roomName) {
      await client.eval(RELEASE_LUA, 1, keyOf(roomName), workerId).catch(() => {});
    },
    async close() {
      await client.quit().catch(() => {});
    },
  };
}

/** In-process registry — fallback when no Valkey URL is configured. */
export function createInMemoryRoomOwnership(): RoomOwnership {
  const owned = new Set<string>();
  return {
    async acquire(roomName) {
      if (owned.has(roomName)) return false;
      owned.add(roomName);
      return true;
    },
    async refresh(roomName) {
      return owned.has(roomName);
    },
    async release(roomName) {
      owned.delete(roomName);
    },
    async close() {
      owned.clear();
    },
  };
}
