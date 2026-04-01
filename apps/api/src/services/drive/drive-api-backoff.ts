const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

function isRetryableStatus(err: unknown): boolean {
  const status = (err as { response?: { status?: number } })?.response?.status;
  return status === 429 || status === 500 || status === 503;
}

/**
 * Retry a Drive API call with exponential backoff + jitter on 429/500/503.
 */
export async function withBackoff<T>(fn: () => Promise<T>, label = "Drive API"): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === MAX_RETRIES || !isRetryableStatus(err)) {
        throw err;
      }
      const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * 500;
      console.warn(
        `[drive] ${label} rate limited (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${Math.round(delay)}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("withBackoff: exhausted retries");
}
