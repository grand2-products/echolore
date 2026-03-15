/**
 * Escape XML-like angle brackets in user-provided text before embedding in
 * LLM prompts.  This prevents users from injecting fake XML tags (e.g.
 * `<system>`) but does **not** defend against all prompt injection vectors.
 * Pair with structural defenses (system/user message separation, output
 * validation) for defence-in-depth.
 */
export function escapeXmlTags(input: string): string {
  if (!input) return "";
  return input.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** @deprecated Use {@link escapeXmlTags} instead. */
export const sanitizePromptInput = escapeXmlTags;
