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
});
