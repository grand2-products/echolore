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
  avatar_file_id: string | null;
  avatar_url: string | null;
}) => {
  if (character.avatar_file_id) {
    return `/api/files/${character.avatar_file_id}/download`;
  }
  return character.avatar_url;
};

export const toCharacterResponse = (
  character: {
    avatar_file_id: string | null;
    avatar_url: string | null;
  } & Record<string, unknown>
) => {
  const { avatar_file_id: _omit, ...rest } = character;
  return { ...rest, avatarUrl: resolveCharacterAvatarUrl(character) };
};
