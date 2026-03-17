import { decrypt, encrypt } from "../../lib/crypto.js";
import { getSiteSetting, upsertSiteSetting } from "../../repositories/admin/admin-repository.js";

const DEFAULT_CACHE_TTL_MS = 60_000;

interface SettingsCacheOptions<T> {
  keys: readonly string[];
  encryptedKeys?: readonly string[];
  mapToSettings: (map: Record<string, string | null>) => T;
  mapToKeyValues: (input: Partial<T>) => Record<string, string | undefined>;
  cacheTtlMs?: number | false;
}

interface SettingsCache<T> {
  get: () => Promise<T>;
  update: (input: Partial<T>) => Promise<T>;
  invalidate: () => void;
}

// ---------------------------------------------------------------------------
// Declarative field-mapping helpers
// ---------------------------------------------------------------------------

/** How to read a DB string into a typed settings field, and write it back. */
export type FieldCodec<V> = {
  /** Convert a DB string|null to the settings value. */
  read: (raw: string | null) => V;
  /** Convert the settings value back to a DB string (undefined = skip). */
  write: (val: V | undefined) => string | undefined;
};

/** Pre-built codecs for common field types. */
export const FieldCodecs = {
  /** string | null  –  empty/missing becomes null. */
  nullable: {
    read: (raw: string | null): string | null => raw || null,
    write: (val: string | null | undefined): string | undefined => val ?? undefined,
  } satisfies FieldCodec<string | null>,

  /** boolean that defaults to false when the DB value is absent. */
  boolFalse: {
    read: (raw: string | null): boolean => raw === "true",
    write: (val: boolean | undefined): string | undefined =>
      val !== undefined ? String(val) : undefined,
  } satisfies FieldCodec<boolean>,

  /** boolean that defaults to true when the DB value is absent or is not "false". */
  boolTrue: {
    read: (raw: string | null): boolean => raw !== "false",
    write: (val: boolean | undefined): string | undefined =>
      val !== undefined ? String(val) : undefined,
  } satisfies FieldCodec<boolean>,

  /** number | null  –  parsed from string; NaN or missing becomes null. */
  nullableNumber: {
    read: (raw: string | null): number | null =>
      raw && Number.isFinite(Number(raw)) ? Number(raw) : null,
    write: (val: number | null | undefined): string | undefined =>
      val != null ? String(val) : undefined,
  } satisfies FieldCodec<number | null>,

  /** A typed string with a default fallback (e.g. provider enums). */
  withDefault<S extends string>(defaultValue: S): FieldCodec<S> {
    return {
      read: (raw: string | null): S => (raw as S) || defaultValue,
      write: (val: S | undefined): string | undefined => val,
    };
  },
};

/** A single field mapping: DB key -> settings key + codec. */
export interface FieldMapping<V = unknown> {
  /** The key in the site_settings table (e.g. "authGoogleClientId"). */
  dbKey: string;
  codec: FieldCodec<V>;
}

/** Helper to define a field mapping with correct typing. */
export function field<V>(dbKey: string, codec: FieldCodec<V>): FieldMapping<V> {
  return { dbKey, codec };
}

interface TypedSettingsCacheOptions {
  encryptedKeys?: readonly string[];
  cacheTtlMs?: number | false;
}

/**
 * Creates a settings cache from a declarative field-mapping definition.
 *
 * Each key of `fields` becomes a key on the resulting settings object.
 * The `FieldCodec` attached to each field handles reading from and writing
 * to the DB string representation.
 */
// biome-ignore lint/suspicious/noExplicitAny: any constraint lets TS infer each field's concrete codec type
export function createTypedSettingsService<F extends Record<string, FieldMapping<any>>>(
  fields: F,
  options: TypedSettingsCacheOptions = {}
): SettingsCache<{ [K in keyof F]: ReturnType<F[K]["codec"]["read"]> }> {
  type T = { [K in keyof F]: ReturnType<F[K]["codec"]["read"]> };

  const keys = Object.values(fields).map((f) => f.dbKey);

  const mapToSettings = (map: Record<string, string | null>): T => {
    const result = {} as Record<string, unknown>;
    for (const [settingsKey, mapping] of Object.entries(fields)) {
      result[settingsKey] = mapping.codec.read(map[mapping.dbKey] ?? null);
    }
    return result as T;
  };

  const mapToKeyValues = (input: Partial<T>): Record<string, string | undefined> => {
    const result: Record<string, string | undefined> = {};
    for (const [settingsKey, mapping] of Object.entries(fields)) {
      const val = (input as Record<string, unknown>)[settingsKey];
      if (val !== undefined) {
        result[mapping.dbKey] = mapping.codec.write(val as never);
      }
    }
    return result;
  };

  return createSettingsCache<T>({
    keys,
    encryptedKeys: options.encryptedKeys,
    mapToSettings,
    mapToKeyValues,
    cacheTtlMs: options.cacheTtlMs,
  });
}

// ---------------------------------------------------------------------------
// Low-level cache (still available for advanced/custom mapping cases)
// ---------------------------------------------------------------------------

export function createSettingsCache<T>(options: SettingsCacheOptions<T>): SettingsCache<T> {
  const { keys, encryptedKeys = [], mapToSettings, mapToKeyValues, cacheTtlMs } = options;
  const ttl = cacheTtlMs === false ? 0 : (cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
  const encryptedKeySet = new Set(encryptedKeys);

  let cached: T | null = null;
  let cacheExpiresAt = 0;

  async function fetchAll(): Promise<T> {
    const entries = await Promise.all(
      keys.map(async (key) => {
        const row = await getSiteSetting(key);
        let value = row?.value ?? null;
        if (value && encryptedKeySet.has(key)) {
          try {
            value = decrypt(value);
          } catch {
            value = null;
          }
        }
        return [key, value] as const;
      })
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
        const finalValue = encryptedKeySet.has(key) && value ? encrypt(value) : value;
        await upsertSiteSetting(key, finalValue);
      }
    }
    invalidate();
    return get();
  }

  return { get, update, invalidate };
}
