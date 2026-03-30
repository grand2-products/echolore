import { describe, expect, it } from "vitest";
import { type BlockDraft, parseMarkdown, parseTypst } from "./import-parser.js";

// ---------------------------------------------------------------------------
// Markdown parser
// ---------------------------------------------------------------------------

describe("parseMarkdown", () => {
  it("parses headings (h1-h3)", () => {
    const md = "# Title\n## Subtitle\n### Section";
    const blocks = parseMarkdown(md);
    expect(blocks).toEqual<BlockDraft[]>([
      { type: "heading1", content: "Title", properties: null },
      { type: "heading2", content: "Subtitle", properties: null },
      { type: "heading3", content: "Section", properties: null },
    ]);
  });

  it("parses paragraphs with inline formatting", () => {
    const md = "Hello **world** and *italic* and `code`";
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe("text");
    expect(blocks[0]?.content).toContain("<strong>world</strong>");
    expect(blocks[0]?.content).toContain("<em>italic</em>");
    expect(blocks[0]?.content).toContain("<code>code</code>");
  });

  it("parses unordered list items", () => {
    const md = "- item 1\n- item 2";
    const blocks = parseMarkdown(md);
    expect(blocks).toEqual<BlockDraft[]>([
      { type: "bulletList", content: "item 1", properties: null },
      { type: "bulletList", content: "item 2", properties: null },
    ]);
  });

  it("parses ordered list items", () => {
    const md = "1. first\n2. second";
    const blocks = parseMarkdown(md);
    expect(blocks).toEqual<BlockDraft[]>([
      { type: "orderedList", content: "first", properties: null },
      { type: "orderedList", content: "second", properties: null },
    ]);
  });

  it("parses code blocks with language", () => {
    const md = "```typescript\nconst x = 1;\n```";
    const blocks = parseMarkdown(md);
    expect(blocks).toEqual<BlockDraft[]>([
      { type: "codeBlock", content: "const x = 1;", properties: { language: "typescript" } },
    ]);
  });

  it("parses code blocks without language", () => {
    const md = "```\nhello\n```";
    const blocks = parseMarkdown(md);
    expect(blocks[0]?.type).toBe("codeBlock");
    expect(blocks[0]?.properties).toBeNull();
  });

  it("parses blockquotes", () => {
    const md = "> This is a quote";
    const blocks = parseMarkdown(md);
    expect(blocks).toEqual<BlockDraft[]>([
      { type: "quote", content: "This is a quote", properties: null },
    ]);
  });

  it("parses thematic breaks", () => {
    const md = "---";
    const blocks = parseMarkdown(md);
    expect(blocks).toEqual<BlockDraft[]>([{ type: "divider", content: null, properties: null }]);
  });

  it("parses standalone images", () => {
    const md = "![alt text](https://example.com/img.png)";
    const blocks = parseMarkdown(md);
    expect(blocks).toEqual<BlockDraft[]>([
      {
        type: "image",
        content: null,
        properties: { src: "https://example.com/img.png", filename: "alt text" },
      },
    ]);
  });

  it("parses links inside paragraphs", () => {
    const md = "Visit [our site](https://example.com) today.";
    const blocks = parseMarkdown(md);
    expect(blocks[0]?.content).toContain('<a href="https://example.com">our site</a>');
  });

  it("handles mixed content", () => {
    const md = [
      "# My Document",
      "",
      "Some text here.",
      "",
      "- bullet one",
      "- bullet two",
      "",
      "```js",
      "console.log('hello');",
      "```",
      "",
      "---",
    ].join("\n");
    const blocks = parseMarkdown(md);
    expect(blocks.map((b) => b.type)).toEqual([
      "heading1",
      "text",
      "bulletList",
      "bulletList",
      "codeBlock",
      "divider",
    ]);
  });

  it("enforces 500 block limit", () => {
    const lines = Array.from({ length: 600 }, (_, i) => `Line ${i}`).join("\n\n");
    const blocks = parseMarkdown(lines);
    expect(blocks.length).toBe(500);
  });

  it("escapes HTML in plain text", () => {
    const md = "Use <script> tags carefully & be safe.";
    const blocks = parseMarkdown(md);
    expect(blocks[0]?.content).toContain("&lt;script&gt;");
    expect(blocks[0]?.content).toContain("&amp;");
  });

  it("strips javascript: URLs from links", () => {
    const md = "[click](javascript:alert(1))";
    const blocks = parseMarkdown(md);
    expect(blocks[0]?.content).not.toContain("javascript:");
    // Link text should be preserved
    expect(blocks[0]?.content).toContain("click");
  });

  it("strips javascript: URLs from images", () => {
    const md = "![xss](javascript:alert(1))";
    const blocks = parseMarkdown(md);
    // Image should be dropped entirely
    expect(blocks).toHaveLength(0);
  });

  it("strips data: URLs from links", () => {
    const md = "[click](data:text/html,<script>alert(1)</script>)";
    const blocks = parseMarkdown(md);
    expect(blocks[0]?.content).not.toContain("data:");
  });

  it("strips javascript: URLs from links inside table cells", () => {
    const md = "| Col |\n| --- |\n| [xss](javascript:alert(1)) |";
    const blocks = parseMarkdown(md);
    const parsed = JSON.parse(blocks[0]?.content ?? "");
    const cell = parsed.content.rows[1].cells[0];
    // Should not contain a link item
    const linkItem = cell.find((i: Record<string, unknown>) => i.type === "link");
    expect(linkItem).toBeUndefined();
    // But text should be preserved
    const textItem = cell.find((i: Record<string, unknown>) => i.text === "xss");
    expect(textItem).toBeDefined();
  });

  it("preserves safe links", () => {
    const md = "[ok](https://example.com) and [mail](mailto:a@b.com)";
    const blocks = parseMarkdown(md);
    expect(blocks[0]?.content).toContain("https://example.com");
    expect(blocks[0]?.content).toContain("mailto:a@b.com");
  });

  it("parses GFM tables", () => {
    const md = "| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |";
    const blocks = parseMarkdown(md);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe("text");
    expect(blocks[0]?.properties).toEqual({ blockNoteType: "table" });
    const parsed = JSON.parse(blocks[0]?.content ?? "");
    expect(parsed.type).toBe("table");
    expect(parsed.content.type).toBe("tableContent");
    expect(parsed.content.rows).toHaveLength(3);
    // Header row
    expect(parsed.content.rows[0].cells[0][0].text).toBe("Name");
    expect(parsed.content.rows[0].cells[1][0].text).toBe("Age");
    // Data rows
    expect(parsed.content.rows[1].cells[0][0].text).toBe("Alice");
    expect(parsed.content.rows[2].cells[1][0].text).toBe("25");
  });

  it("preserves bold inside links in table cells", () => {
    const md = "| Col |\n| --- |\n| [**bold link**](https://example.com) |";
    const blocks = parseMarkdown(md);
    const parsed = JSON.parse(blocks[0]?.content ?? "");
    const cell = parsed.content.rows[1].cells[0];
    const linkItem = cell.find((i: Record<string, unknown>) => i.type === "link");
    expect(linkItem?.href).toBe("https://example.com");
    const boldInLink = linkItem?.content?.find(
      (i: Record<string, unknown>) => (i.styles as Record<string, unknown>)?.bold
    );
    expect(boldInLink?.text).toBe("bold link");
  });

  it("preserves inline formatting in table cells", () => {
    const md = "| Header |\n| --- |\n| **bold** and *italic* |";
    const blocks = parseMarkdown(md);
    const parsed = JSON.parse(blocks[0]?.content ?? "");
    const cellContent = parsed.content.rows[1].cells[0];
    const boldItem = cellContent.find(
      (i: Record<string, unknown>) => (i.styles as Record<string, unknown>)?.bold
    );
    const italicItem = cellContent.find(
      (i: Record<string, unknown>) => (i.styles as Record<string, unknown>)?.italic
    );
    expect(boldItem?.text).toBe("bold");
    expect(italicItem?.text).toBe("italic");
  });
});

// ---------------------------------------------------------------------------
// Typst parser
// ---------------------------------------------------------------------------

describe("parseTypst", () => {
  it("parses headings", () => {
    const src = "= Title\n== Subtitle\n=== Section";
    const blocks = parseTypst(src);
    expect(blocks).toEqual<BlockDraft[]>([
      { type: "heading1", content: "Title", properties: null },
      { type: "heading2", content: "Subtitle", properties: null },
      { type: "heading3", content: "Section", properties: null },
    ]);
  });

  it("parses unordered lists", () => {
    const src = "- item a\n- item b";
    const blocks = parseTypst(src);
    expect(blocks).toEqual<BlockDraft[]>([
      { type: "bulletList", content: "item a", properties: null },
      { type: "bulletList", content: "item b", properties: null },
    ]);
  });

  it("parses ordered lists", () => {
    const src = "+ first\n+ second";
    const blocks = parseTypst(src);
    expect(blocks).toEqual<BlockDraft[]>([
      { type: "orderedList", content: "first", properties: null },
      { type: "orderedList", content: "second", properties: null },
    ]);
  });

  it("parses code blocks", () => {
    const src = "```python\nprint('hello')\n```";
    const blocks = parseTypst(src);
    expect(blocks).toEqual<BlockDraft[]>([
      { type: "codeBlock", content: "print('hello')", properties: { language: "python" } },
    ]);
  });

  it("parses dividers", () => {
    const src = "---";
    const blocks = parseTypst(src);
    expect(blocks).toEqual<BlockDraft[]>([{ type: "divider", content: null, properties: null }]);
  });

  it("parses #line() divider", () => {
    const src = "#line()";
    const blocks = parseTypst(src);
    expect(blocks).toEqual<BlockDraft[]>([{ type: "divider", content: null, properties: null }]);
  });

  it("parses images", () => {
    const src = '#image("logo.png")';
    const blocks = parseTypst(src);
    expect(blocks).toEqual<BlockDraft[]>([
      { type: "image", content: null, properties: { src: "logo.png", filename: null } },
    ]);
  });

  it("converts inline formatting", () => {
    const src = "This is *bold* and _italic_ and `code`.";
    const blocks = parseTypst(src);
    expect(blocks[0]?.content).toContain("<strong>bold</strong>");
    expect(blocks[0]?.content).toContain("<em>italic</em>");
    expect(blocks[0]?.content).toContain("<code>code</code>");
  });

  it("handles plain text paragraphs", () => {
    const src = "Hello world.\nThis is a continuation.";
    const blocks = parseTypst(src);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe("text");
    expect(blocks[0]?.content).toContain("Hello world.");
  });

  it("handles mixed content", () => {
    const src = [
      "= My Document",
      "",
      "Some text here.",
      "",
      "- bullet one",
      "- bullet two",
      "",
      "```js",
      "console.log('hello');",
      "```",
      "",
      "---",
    ].join("\n");
    const blocks = parseTypst(src);
    expect(blocks.map((b) => b.type)).toEqual([
      "heading1",
      "text",
      "bulletList",
      "bulletList",
      "codeBlock",
      "divider",
    ]);
  });

  it("enforces 500 block limit", () => {
    const lines = Array.from({ length: 600 }, (_, i) => `= Heading ${i}`).join("\n");
    const blocks = parseTypst(lines);
    expect(blocks.length).toBe(500);
  });

  it("strips javascript: URLs from images", () => {
    const src = '#image("javascript:alert(1)")';
    const blocks = parseTypst(src);
    // Image with dangerous scheme should be dropped
    const imageBlock = blocks.find((b) => b.type === "image");
    expect(imageBlock).toBeUndefined();
  });
});
