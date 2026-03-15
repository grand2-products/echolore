"use client";

import { type EffectCallback, useEffect, useRef } from "react";

/**
 * Run a callback once on mount. The callback can safely reference
 * values that change over time (e.g. `t()`) without causing re-runs.
 */
export function useMountEffect(fn: EffectCallback): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => fnRef.current(), []);
}
