import {
  getSiteSetting,
  upsertSiteSetting,
} from "../../repositories/admin/admin-repository.js";

const DEFAULT_CACHE_TTL_MS = 60_000;

interface SettingsCacheOptions<T> {
  keys: readonly string[];
  mapToSettings: (map: Record<string, string | null>) => T;
  mapToKeyValues: (input: Partial<T>) => Record<string, string | undefined>;
  cacheTtlMs?: number | false;
}

interface SettingsCache<T> {
  get: () => Promise<T>;
  update: (input: Partial<T>) => Promise<T>;
  invalidate: () => void;
}

export function createSettingsCache<T>(
  options: SettingsCacheOptions<T>,
): SettingsCache<T> {
  const { keys, mapToSettings, mapToKeyValues, cacheTtlMs } = options;
  const ttl = cacheTtlMs === false ? 0 : (cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);

  let cached: T | null = null;
  let cacheExpiresAt = 0;

  async function fetchAll(): Promise<T> {
    const entries = await Promise.all(
      keys.map(async (key) => {
        const row = await getSiteSetting(key);
        return [key, row?.value ?? null] as const;
      }),
    );
    const map = Object.fromEntries(entries) as Record<string, string | null>;
    return mapToSettings(map);
  }

  async function get(): Promise<T> {
    if (ttl > 0) {
      const now = Date.now();
      if (cached && now < cacheExpiresAt) {
        return cached;
      }
      const settings = await fetchAll();
      cached = settings;
      cacheExpiresAt = Date.now() + ttl;
      return settings;
    }
    return fetchAll();
  }

  function invalidate() {
    cached = null;
    cacheExpiresAt = 0;
  }

  async function update(input: Partial<T>): Promise<T> {
    const keyMap = mapToKeyValues(input);
    for (const [key, value] of Object.entries(keyMap)) {
      if (value !== undefined) {
        await upsertSiteSetting(key, value);
      }
    }
    invalidate();
    return get();
  }

  return { get, update, invalidate };
}
