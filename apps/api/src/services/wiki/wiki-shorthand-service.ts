import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { initLlmWithSettings } from "../../ai/llm/init-llm-with-settings.js";

export class LlmNotConfiguredError extends Error {
  constructor(message = "LLM is not configured or enabled") {
    super(message);
    this.name = "LlmNotConfiguredError";
  }
}

interface ShorthandBlock {
  id: string;
  type: string;
  text: string;
}

interface InsertOperation {
  action: "insert";
  afterBlockId: string | null;
  blocks: Array<{ type: string; content: string }>;
}

interface UpdateOperation {
  action: "update";
  blockId: string;
  content: string;
}

export type ShorthandOperation = InsertOperation | UpdateOperation;

export interface ShorthandResult {
  operations: ShorthandOperation[];
}

const SYSTEM_PROMPT = `You are a wiki editor assistant. Given a page's current block structure and a user's shorthand note, determine the best way to incorporate the note into the page.

Respond with ONLY a JSON object: {"operations": [...]}

Each operation is one of:
1. {"action":"insert","afterBlockId":"<id or null>","blocks":[{"type":"<type>","content":"<text>"}]}
2. {"action":"update","blockId":"<id>","content":"<new full text>"}

Valid types: paragraph, heading, bulletListItem, numberedListItem, codeBlock
For heading, prefix content with level: "## Title" for h2, "### Title" for h3.

Rules:
- Add to existing lists by inserting a new list item after the last item.
- Use update only when the note explicitly corrects/amends existing text.
- Place new content at the most logical position based on topic/context.
- Keep existing content intact unless the user asks to change it.
- No markdown fences. No explanation. JSON only.`;

function buildHumanMessage(pageTitle: string, blocks: ShorthandBlock[], input: string): string {
  const blockLines = blocks.map((b) => `[${b.id}] (${b.type}) ${b.text}`).join("\n");
  return `Page: ${pageTitle}\n\nBlocks:\n${blockLines}\n\nNote: ${input}`;
}

export async function processShorthand(
  pageTitle: string,
  blocks: ShorthandBlock[],
  input: string
): Promise<ShorthandResult> {
  const llm = await initLlmWithSettings({ temperature: 0.2, maxTokens: 2048 });
  if (!llm) {
    throw new LlmNotConfiguredError();
  }

  let response: Awaited<ReturnType<typeof llm.model.invoke>>;
  try {
    response = await llm.model.invoke([
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(buildHumanMessage(pageTitle, blocks, input)),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`LLM invocation failed: ${msg}`);
  }

  const text =
    typeof response.content === "string"
      ? response.content
      : Array.isArray(response.content)
        ? response.content
            .filter(
              (c): c is { type: "text"; text: string } => typeof c === "object" && "text" in c
            )
            .map((c) => c.text)
            .join("")
        : "";

  // Strip markdown code fences if present
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  if (!cleaned) {
    throw new Error("LLM returned an empty response");
  }

  let parsed: ShorthandResult;
  try {
    parsed = JSON.parse(cleaned) as ShorthandResult;
  } catch {
    throw new Error(`LLM returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }

  // Validate structure
  if (!Array.isArray(parsed.operations)) {
    throw new Error("Invalid LLM response: missing operations array");
  }

  for (const op of parsed.operations) {
    if (op.action === "insert") {
      if (!Array.isArray(op.blocks) || op.blocks.length === 0) {
        throw new Error("Invalid insert operation: missing blocks");
      }
    } else if (op.action === "update") {
      if (!op.blockId || typeof op.content !== "string") {
        throw new Error("Invalid update operation: missing blockId or content");
      }
    } else {
      throw new Error(`Unknown operation action: ${(op as { action: string }).action}`);
    }
  }

  return parsed;
}
