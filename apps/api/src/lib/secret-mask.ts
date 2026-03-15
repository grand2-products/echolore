const MASK = "••••••••";

function deepClone<T extends object>(data: T): T {
  return structuredClone(data);
}

export function maskSecrets<T extends object>(data: T, secretFields: (keyof T)[]): T {
  const result = deepClone(data);
  for (const field of secretFields) {
    if (result[field]) {
      Object.defineProperty(result, field, {
        value: MASK,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }
  return result;
}

export function stripMaskedValues<T extends object>(data: T, secretFields: (keyof T)[]): T {
  const result = deepClone(data);
  for (const field of secretFields) {
    if (result[field] === MASK) {
      delete result[field];
    }
  }
  return result;
}
