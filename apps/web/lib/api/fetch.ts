/**
 * Core fetch utilities for the API client.
 * All API modules import fetchApi / executeApiRequest / buildApiUrl from here.
 */

import type { ErrorResponse } from "@echolore/shared/contracts";
import { getPublicApiUrl } from "../runtime-env";

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function resolveApiBase() {
  const raw = getPublicApiUrl();
  try {
    const url = new URL(raw);
    const pathname = url.pathname.replace(/\/+$/, "");
    url.pathname = pathname.endsWith("/api") ? pathname : `${pathname}/api`;
    return url.toString().replace(/\/$/, "");
  } catch {
    return "http://localhost:3001/api";
  }
}

function getApiBase() {
  return resolveApiBase();
}
let refreshSessionPromise: Promise<boolean> | null = null;

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBase()}${normalizedPath}`;
}

/**
 * Resolve an avatar URL for display in `<Image src>`.
 * - External URLs (http/https) are returned as-is.
 * - Internal API paths (e.g. `/api/users/{id}/avatar`) are returned as
 *   relative paths so the browser resolves them against the current origin.
 * - Falsy values return `null`.
 */
export function resolveAvatarSrc(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://")) {
    return avatarUrl;
  }
  // Internal path – return as-is (relative to origin)
  if (avatarUrl.startsWith("/")) {
    return avatarUrl;
  }
  return null;
}

export function buildAuthJsUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBase().replace(/\/api$/, "")}${normalizedPath}`;
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
    refreshSessionPromise = fetch(`${getApiBase().replace(/\/api$/, "")}/api/auth/session`, {
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
 * Fetch for public (unauthenticated) API endpoints.
 * Does not attempt session refresh on 401.
 */
export async function fetchPublic<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers: {
      ...(options?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return response.json();
}

export async function uploadFile<T>(
  path: string,
  file: File,
  extraFields?: Record<string, string>
): Promise<T> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      formData.append(key, value);
    }
  }

  const response = await executeApiRequest(path, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw await parseApiError(response);
  }

  return response.json();
}

/**
 * Fetch a file via the authenticated API client and return a blob URL.
 * Resolves relative `/api/...` paths through the API base URL.
 * Used by Three.js loaders that cannot send auth cookies cross-origin.
 */
export async function fetchBlobUrl(url: string): Promise<string> {
  if (url.startsWith("/api/")) {
    const apiPath = url.replace(/^\/api/, "");
    const response = await executeApiRequest(apiPath);
    if (!response.ok) {
      throw await parseApiError(response);
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  }
  return url;
}

/**
 * Fetch plain text from an absolute or relative URL.
 * Useful for endpoints like HLS manifests where the response is not JSON.
 */
export async function fetchText(url: string, options?: RequestInit): Promise<string> {
  const response = await fetch(url, {
    ...options,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new ApiError(text || `HTTP error! status: ${response.status}`, {
      status: response.status,
    });
  }

  return response.text();
}
