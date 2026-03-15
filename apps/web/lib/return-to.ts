const AUTH_LOOP_PREFIXES = ["/login", "/api/auth/"] as const;

function decodeReturnTo(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeReturnTo(rawValue: string | null | undefined) {
  if (!rawValue) {
    return null;
  }

  const decoded = decodeReturnTo(rawValue.trim());
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\")) {
    return null;
  }

  try {
    const url = new URL(decoded, "http://localhost");
    const normalized = `${url.pathname}${url.search}${url.hash}`;
    if (AUTH_LOOP_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

export function buildCurrentReturnTo(
  pathname: string,
  searchParams?: Pick<URLSearchParams, "toString"> | null
) {
  const query = searchParams?.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function buildLoginUrl(returnTo?: string | null) {
  const safeReturnTo = normalizeReturnTo(returnTo);
  if (!safeReturnTo) {
    return "/login";
  }

  const params = new URLSearchParams({ returnTo: safeReturnTo });
  return `/login?${params.toString()}`;
}
