"use client";
import { useCallback, useEffect, useRef, useState } from "react";

interface UseAsyncDataResult<T> {
  data: T;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<T>;
}

export function useAsyncData<T>(
  initialValue: T,
  fetcher: () => Promise<T>,
  options?: { deps?: unknown[] }
): UseAsyncDataResult<T> {
  const [data, setData] = useState<T>(initialValue);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const initialValueRef = useRef(initialValue);

  const load = useCallback(async (signal?: AbortSignal): Promise<T> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (!signal?.aborted) {
        setData(result);
      }
      return result;
    } catch (err) {
      if (!signal?.aborted) {
        setError(err instanceof Error ? err.message : String(err));
      }
      return initialValueRef.current;
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: deps controlled by caller
  }, options?.deps ?? []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refetch = useCallback(() => load(), [load]);

  return { data, isLoading, error, refetch };
}
