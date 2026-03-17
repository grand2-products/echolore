/** Coerce an unknown value (typically from a DB aggregate) to a number. */
export const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
};
