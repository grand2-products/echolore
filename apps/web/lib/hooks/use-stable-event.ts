"use client";

import { useCallback, useRef } from "react";

export function useStableEvent<TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  return useCallback((...args: TArgs) => fnRef.current(...args), []);
}
