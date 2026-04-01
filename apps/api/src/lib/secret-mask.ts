const MASK_PLACEHOLDER = "••••••••";
const PREFIX_LEN = 4;
const SUFFIX_LEN = 4;
const MIN_LEN_FOR_PARTIAL = PREFIX_LEN + SUFFIX_LEN + 2; // need at least 10 chars to show prefix/suffix

function deepClone<T extends object>(data: T): T {
  return structuredClone(data);
}

/**
 * Mask a secret value, showing prefix and suffix for identification.
 * Short values (< 10 chars) are fully masked.
 *
 * Examples:
 *   "AIzaSyA1b2c3d4e5f6g7h8" → "AIza••••••g7h8"
 *   "sk-abc"                  → "••••••••"
 *   null / ""                 → unchanged (not masked)
 */
function maskValue(value: string): string {
  if (value.length < MIN_LEN_FOR_PARTIAL) {
    return MASK_PLACEHOLDER;
  }
  const prefix = value.slice(0, PREFIX_LEN);
  const suffix = value.slice(-SUFFIX_LEN);
  return `${prefix}${"••••••"}${suffix}`;
}

export function maskSecrets<T extends object>(data: T, secretFields: (keyof T)[]): T {
  const result = deepClone(data);
  for (const field of secretFields) {
    const val = result[field];
    if (typeof val === "string" && val.length > 0) {
      Object.defineProperty(result, field, {
        value: maskValue(val),
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }
  return result;
}

export function isMaskedValue(value: unknown): boolean {
  return typeof value === "string" && value.includes("••••••");
}

export function stripMaskedValues<T extends object>(data: T, secretFields: (keyof T)[]): T {
  const result = deepClone(data);
  for (const field of secretFields) {
    if (isMaskedValue(result[field])) {
      delete result[field];
    }
  }
  return result;
}
