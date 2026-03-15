const MASK = "••••••••";

// biome-ignore lint/suspicious/noExplicitAny: settings objects have dynamic shapes
type AnyObject = Record<string, any>;

function deepClone<T extends AnyObject>(data: T): T {
  return structuredClone(data);
}

export function maskSecrets<T extends AnyObject>(data: T, secretFields: (keyof T)[]): T {
  const result = deepClone(data);
  for (const field of secretFields) {
    if (result[field]) {
      result[field] = MASK as T[keyof T];
    }
  }
  return result;
}

export function stripMaskedValues<T extends AnyObject>(data: T, secretFields: (keyof T)[]): T {
  const result = deepClone(data);
  for (const field of secretFields) {
    if (result[field] === MASK) {
      delete result[field];
    }
  }
  return result;
}
