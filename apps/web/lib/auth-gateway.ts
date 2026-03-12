function normalizeAuthGatewayBaseUrl(rawUrl: string | undefined) {
  if (!rawUrl) {
    return "";
  }

  try {
    const url = new URL(rawUrl);
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

const AUTH_GATEWAY_BASE_URL = normalizeAuthGatewayBaseUrl(
  process.env.NEXT_PUBLIC_AUTH_GATEWAY_URL,
);

export function buildAuthGatewayUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (AUTH_GATEWAY_BASE_URL) {
    return `${AUTH_GATEWAY_BASE_URL}${normalizedPath}`;
  }

  if (typeof window !== "undefined") {
    return `${window.location.origin}${normalizedPath}`;
  }

  return normalizedPath;
}
