/**
 * Core fetch utilities for the API client.
 * All API modules import fetchApi / executeApiRequest / buildApiUrl from here.
 */

import type { ErrorResponse } from "@contracts/index";

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function normalizeApiBaseUrl(rawUrl: string | undefined) {
  const fallback = "http://localhost:3001/api";
  if (!rawUrl) {
    return fallback;
  }

  try {
    const url = new URL(rawUrl);
    const pathname = url.pathname.replace(/\/+$/, "");
    url.pathname = pathname.endsWith("/api") ? pathname : `${pathname}/api`;
    return url.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

const API_BASE = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
let refreshSessionPromise: Promise<boolean> | null = null;

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  status: number;
  code?: string;
  detail?: string;

  constructor(message: string, options: { status: number; code?: string; detail?: string }) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.detail = options.detail;
  }
}

export function isApiErrorStatus(error: unknown, status: number) {
  return error instanceof ApiError && error.status === status;
}

export async function parseApiError(response: Response) {
  const error = await response
    .json()
    .catch((): ErrorResponse => ({ error: "Unknown error", code: "UNKNOWN_ERROR" }));

  let message: string;
  if (typeof error.error === "string") {
    message = error.error;
  } else if (error.error && typeof error.error === "object") {
    // Zod validation errors return { success: false, error: { issues: [...] } }
    const issues = Array.isArray(error.error.issues) ? error.error.issues : [];
    message =
      issues.length > 0
        ? issues
            .map((i: { path?: string[]; message?: string }) => {
              const field = i.path?.join(".") ?? "";
              return field ? `${field}: ${i.message}` : (i.message ?? "");
            })
            .join("; ")
        : `HTTP error! status: ${response.status}`;
  } else {
    message = `HTTP error! status: ${response.status}`;
  }

  return new ApiError(message, {
    status: response.status,
    code: error.code,
    detail: error.message,
  });
}

// ---------------------------------------------------------------------------
// Auth refresh helpers
// ---------------------------------------------------------------------------

function shouldAttemptSilentRefresh(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!normalizedPath.startsWith("/auth/")) {
    return true;
  }

  return normalizedPath === "/auth/me";
}

async function refreshPasswordSession() {
  if (!refreshSessionPromise) {
    refreshSessionPromise = fetch(`${API_BASE.replace(/\/api$/, "")}/api/auth/session`, {
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) return false;
        const session = await response.json().catch(() => null);
        return Boolean(session?.user);
      })
      .catch(() => false)
      .finally(() => {
        refreshSessionPromise = null;
      });
  }

  return refreshSessionPromise;
}

// ---------------------------------------------------------------------------
// Core request execution
// ---------------------------------------------------------------------------

export async function executeApiRequest(path: string, options?: RequestInit, allowRefresh = true) {
  const response = await fetch(buildApiUrl(path), {
    ...options,
    credentials: "include",
    headers: {
      ...(options?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  });

  if (
    response.status === 401 &&
    allowRefresh &&
    shouldAttemptSilentRefresh(path) &&
    (await refreshPasswordSession())
  ) {
    return executeApiRequest(path, options, false);
  }

  return response;
}

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await executeApiRequest(path, options);

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return response.json();
}

/**
 * Generic fetch function for API calls (exported for backward compatibility)
 */
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  return fetchApi<T>(path, options);
}
