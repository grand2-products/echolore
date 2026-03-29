/**
 * Resolve the user avatar URL for API responses.
 *
 * DB stores either:
 *   - a storage-relative path like "avatars/user_xxx.png"  (uploaded)
 *   - an external URL like "https://lh3.googleusercontent.com/..." (Google SSO)
 *   - null (no avatar)
 *
 * This function converts storage paths to the serving endpoint URL
 * and passes through external URLs and null unchanged.
 */
export function resolveUserAvatarUrl(user: {
  id: string;
  avatar_url: string | null;
}): string | null {
  if (!user.avatar_url) return null;

  // External URL — pass through
  if (user.avatar_url.startsWith("http://") || user.avatar_url.startsWith("https://")) {
    return user.avatar_url;
  }

  // Internal storage path — convert to serving endpoint
  if (user.avatar_url.startsWith("avatars/")) {
    return `/api/users/${user.id}/avatar`;
  }

  // Legacy value (e.g. "/api/users/{id}/avatar" from before refactor) — pass through
  return user.avatar_url;
}
