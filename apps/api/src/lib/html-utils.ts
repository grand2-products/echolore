/**
 * Strip HTML tags, decode common entities, and normalize whitespace.
 */
export function stripHtml(html: string): string {
  let text = html;

  // Remove <br>, <br/>, <br /> tags and replace with newline
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Remove all other HTML tags
  text = text.replace(/<[^>]*>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));

  // Normalize whitespace: collapse multiple spaces/tabs, trim lines
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n");

  // Collapse multiple blank lines into one
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}
