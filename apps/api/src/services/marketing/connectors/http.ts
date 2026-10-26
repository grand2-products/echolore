import { ConnectorError } from "./types.js";

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  /** Extra retry decision based on the parsed error body (e.g. Meta rate-limit codes). */
  isRetryableBody?: (status: number, body: unknown) => boolean;
  /** Extracts a human-readable error from the body. Must not include credentials. */
  describeError?: (status: number, body: unknown) => string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let sleepImpl = sleep;
/** Test hook to skip backoff delays. */
export function _setSleepForTests(fn: (ms: number) => Promise<void>) {
  sleepImpl = fn;
}

function defaultDescribe(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const err = (body as { error?: unknown }).error;
    if (typeof err === "string") return `HTTP ${status}: ${err}`;
    if (
      err &&
      typeof err === "object" &&
      typeof (err as { message?: unknown }).message === "string"
    ) {
      return `HTTP ${status}: ${(err as { message: string }).message}`;
    }
  }
  return `HTTP ${status}`;
}

/**
 * JSON request with exponential backoff on 429 / 5xx / network errors
 * (API制限・再試行). Error messages never include the request URL because
 * some APIs carry credentials in query strings.
 */
export async function fetchJsonWithRetry<T>(
  url: string,
  init: RequestInit,
  options: RetryOptions = {}
): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const describe = options.describeError ?? defaultDescribe;

  let lastError: ConnectorError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await sleepImpl(baseDelayMs * 2 ** (attempt - 1));
    }
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      const reason = err instanceof Error ? err.name : "network error";
      lastError = new ConnectorError(`Request failed (${reason})`, true);
      continue;
    }

    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }

    if (response.ok) return body as T;

    const retryable =
      response.status === 429 ||
      response.status >= 500 ||
      (options.isRetryableBody?.(response.status, body) ?? false);
    lastError = new ConnectorError(describe(response.status, body), retryable);
    if (!retryable) break;
  }
  throw lastError ?? new ConnectorError("Request failed");
}
