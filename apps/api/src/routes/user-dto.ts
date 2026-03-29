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
  avatarUrl: string | null;
}): string | null {
  if (!user.avatarUrl) return null;

  // External URL — pass through
  if (user.avatarUrl.startsWith("http://") || user.avatarUrl.startsWith("https://")) {
    return user.avatarUrl;
  }

  // Internal storage path — convert to serving endpoint
  if (user.avatarUrl.startsWith("avatars/")) {
    return `/api/users/${user.id}/avatar`;
  }

  // Legacy value (e.g. "/api/users/{id}/avatar" from before refactor) — pass through
  return user.avatarUrl;
}
