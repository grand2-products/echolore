"use client";

import { useEffect, useRef } from "react";

/**
 * Run a callback once on mount. The callback can safely reference
 * values that change over time (e.g. `t()`) without causing re-runs.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: matches React.useEffect callback signature
export function useMountEffect(fn: () => void | (() => void)): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => fnRef.current(), []);
}
