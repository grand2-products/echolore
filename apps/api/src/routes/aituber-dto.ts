// Control character pattern: \x00-\x08, \x0b, \x0c, \x0e-\x1f, \x7f
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — stripping control chars for security
const CONTROL_CHAR_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

/** Escape HTML special characters to prevent XSS via Data Channel */
export function sanitizeText(input: string): string {
  return input
    .replace(CONTROL_CHAR_RE, "")
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
