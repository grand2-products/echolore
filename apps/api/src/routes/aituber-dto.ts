/** Escape HTML special characters to prevent XSS via Data Channel */
export function sanitizeText(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const resolveCharacterAvatarUrl = (character: {
  avatarFileId: string | null;
  avatarUrl: string | null;
}) => {
  if (character.avatarFileId) {
    return `/api/files/${character.avatarFileId}/download`;
  }
  return character.avatarUrl;
};

export const toCharacterResponse = (
  character: {
    avatarFileId: string | null;
    avatarUrl: string | null;
  } & Record<string, unknown>
) => {
  const { avatarFileId: _omit, ...rest } = character;
  return { ...rest, avatarUrl: resolveCharacterAvatarUrl(character) };
};
