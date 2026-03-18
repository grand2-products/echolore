import type { BlockNoteEditor } from "@blocknote/core";

interface SerializedBlock {
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

type ShorthandOperation = InsertOperation | UpdateOperation;

export interface ShorthandResponse {
  operations: ShorthandOperation[];
}

/**
 * Serialize the editor document into a lightweight format for the LLM.
 */
export function serializeEditorForLlm(
  // biome-ignore lint/suspicious/noExplicitAny: BlockNoteEditor generics vary
  editor: BlockNoteEditor<any, any, any>
): SerializedBlock[] {
  const result: SerializedBlock[] = [];

  function extractText(content: unknown): string {
    if (!content) return "";
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content
      .filter(
        (item: unknown): item is { type: string; text?: string } =>
          typeof item === "object" && item !== null && "type" in item
      )
      .filter((item) => item.type === "text")
      .map((item) => item.text ?? "")
      .join("");
  }

  function walkBlocks(blocks: unknown[]): void {
    for (const block of blocks) {
      if (typeof block !== "object" || block === null) continue;
      const b = block as {
        id?: string;
        type?: string;
        content?: unknown;
        children?: unknown[];
      };
      if (b.id && b.type) {
        result.push({
          id: b.id,
          type: b.type,
          text: extractText(b.content),
        });
      }
      if (Array.isArray(b.children) && b.children.length > 0) {
        walkBlocks(b.children);
      }
    }
  }

  walkBlocks(editor.document as unknown[]);
  return result;
}

/**
 * Convert a shorthand block descriptor to a BlockNote partial block.
 */
function toBlockNoteBlock(block: { type: string; content: string }) {
  const type = block.type;
  const props: Record<string, unknown> = {};
  let text = block.content;

  if (type === "heading") {
    // Parse heading level from content prefix
    const match = text.match(/^(#{1,3})\s+(.*)/);
    if (match?.[1] && match[2] !== undefined) {
      props.level = match[1].length as 1 | 2 | 3;
      text = match[2];
    } else {
      props.level = 2;
    }
  }

  return {
    type: type as "paragraph" | "heading" | "bulletListItem" | "numberedListItem" | "codeBlock",
    props,
    content: text,
  };
}

/**
 * Apply shorthand operations returned by the API to the BlockNote editor.
 * Falls back to appending at the end if a referenced block is not found.
 */
export function applyShorthandOperations(
  // biome-ignore lint/suspicious/noExplicitAny: BlockNoteEditor generics vary
  editor: BlockNoteEditor<any, any, any>,
  operations: ShorthandOperation[]
): void {
  for (const op of operations) {
    try {
      if (op.action === "insert") {
        const newBlocks = op.blocks.map(toBlockNoteBlock);

        if (op.afterBlockId) {
          // Try to find the referenced block
          const refBlock = findBlock(editor, op.afterBlockId);
          if (refBlock) {
            editor.insertBlocks(newBlocks, refBlock, "after");
          } else {
            // Fallback: append at end
            appendBlocks(editor, newBlocks);
          }
        } else {
          // Insert at the beginning
          const firstBlock = editor.document[0];
          if (firstBlock) {
            editor.insertBlocks(newBlocks, firstBlock, "before");
          } else {
            appendBlocks(editor, newBlocks);
          }
        }
      } else if (op.action === "update") {
        const block = findBlock(editor, op.blockId);
        if (block) {
          editor.updateBlock(block, { content: op.content });
        }
        // Skip silently if block not found
      }
    } catch (err) {
      console.error("Failed to apply shorthand operation:", err);
    }
  }
}

function findBlock(
  // biome-ignore lint/suspicious/noExplicitAny: BlockNoteEditor generics vary
  editor: BlockNoteEditor<any, any, any>,
  blockId: string
  // biome-ignore lint/suspicious/noExplicitAny: return type depends on editor
): any | undefined {
  try {
    return editor.getBlock(blockId);
  } catch {
    return undefined;
  }
}

function appendBlocks(
  // biome-ignore lint/suspicious/noExplicitAny: BlockNoteEditor generics vary
  editor: BlockNoteEditor<any, any, any>,
  // biome-ignore lint/suspicious/noExplicitAny: partial block type
  blocks: any[]
): void {
  const doc = editor.document;
  const lastBlock = doc[doc.length - 1];
  if (lastBlock) {
    editor.insertBlocks(blocks, lastBlock, "after");
  }
}
