/**
 * Prompt templates for the AI knowledge suggestion system.
 */

export function buildKnowledgeSuggestionPrompt(input: {
  sourceDescription: string;
  sourceContent: string;
  existingPages: Array<{ id: string; title: string; snippet: string }>;
}): string {
  const existingPagesBlock =
    input.existingPages.length > 0
      ? [
          "## Existing Wiki Pages",
          "",
          ...input.existingPages.map((p) => `- **${p.title}** (id: ${p.id})\n  ${p.snippet}`),
          "",
        ].join("\n")
      : "## Existing Wiki Pages\n\nNo existing pages found.\n";

  return [
    "You are a knowledge management assistant for an internal wiki.",
    "Your job is to analyze source content and suggest wiki updates.",
    "",
    `## Source: ${input.sourceDescription}`,
    "",
    "```",
    input.sourceContent.slice(0, 12000),
    "```",
    "",
    existingPagesBlock,
    "## Instructions",
    "",
    "Analyze the source content and determine if any wiki pages should be created or updated.",
    "For each suggestion, provide:",
    "",
    "1. **targetType**: `new_page` if the content warrants a new page, `update_page` if an existing page should be updated.",
    "2. **targetPageId**: If `update_page`, the ID of the page to update (from the existing pages list).",
    "3. **proposedTitle**: A clear, concise title for the page.",
    "4. **blocks**: An array of content blocks in the format:",
    '   `[{ "type": "heading1"|"heading2"|"text"|"bulletList"|"code", "content": "...", "properties": null, "sortOrder": N }]`',
    "5. **reasoning**: A brief explanation of why this suggestion is useful.",
    "",
    "Respond with a JSON array of suggestions. If no suggestions are warranted, return `[]`.",
    "",
    "```json",
    "[",
    '  { "targetType": "new_page", "targetPageId": null, "proposedTitle": "...", "blocks": [...], "reasoning": "..." }',
    "]",
    "```",
    "",
    "Important:",
    "- Only suggest meaningful, actionable updates.",
    "- Use the same language as the source content.",
    "- Keep content well-structured with headings and bullet points.",
    "- Do not duplicate existing pages unless the content is significantly different.",
  ].join("\n");
}
