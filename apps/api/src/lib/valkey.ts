import Redis from "ioredis";

const VALKEY_URL = process.env.VALKEY_URL || "redis://localhost:6379";

let client: Redis | null = null;

/**
 * Get the shared Valkey (Redis-compatible) client.
 * Returns null if connection is not available (graceful degradation).
 */
export function getValkey(): Redis | null {
  if (client) return client;

  try {
    client = new Redis(VALKEY_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    client.on("error", (err) => {
      console.warn("[valkey] connection error:", err.message);
    });

    void client.connect().catch(() => {
      console.warn("[valkey] failed to connect, caching disabled");
      client = null;
    });

    return client;
  } catch {
    console.warn("[valkey] failed to create client, caching disabled");
    return null;
  }
}
