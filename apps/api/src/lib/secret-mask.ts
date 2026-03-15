const MASK = "••••••••";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObject = Record<string, any>;

export function maskSecrets<T extends AnyObject>(
  data: T,
  secretFields: (keyof T)[],
): T {
  const result = { ...data };
  for (const field of secretFields) {
    if (result[field]) {
      result[field] = MASK as T[keyof T];
    }
  }
  return result;
}

export function stripMaskedValues<T extends AnyObject>(
  data: T,
  secretFields: (keyof T)[],
): T {
  const result = { ...data };
  for (const field of secretFields) {
    if (result[field] === MASK) {
      delete result[field];
    }
  }
  return result;
}
