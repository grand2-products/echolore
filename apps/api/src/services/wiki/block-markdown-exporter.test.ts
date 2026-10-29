import { describe, expect, it } from "vitest";
import { blocksToMarkdown, inlineHtmlToMarkdown } from "./block-markdown-exporter.js";

describe("inlineHtmlToMarkdown", () => {
  it("converts bold, italic, strike, and inline code", () => {
    expect(
      inlineHtmlToMarkdown(
        "<strong>bold</strong> and <em>it</em> and <s>old</s> and <code>x</code>"
      )
    ).toBe("**bold** and *it* and ~~old~~ and `x`");
  });

  it("converts links with hrefs and decodes entities", () => {
    expect(inlineHtmlToMarkdown('<a href="https://example.com/a?b=1&amp;c=2">docs</a>')).toBe(
      "[docs](https://example.com/a?b=1&c=2)"
    );
  });

  it("handles nested inline styles", () => {
    expect(inlineHtmlToMarkdown("<strong>bold <em>both</em></strong>")).toBe("**bold *both***");
  });

  it("converts br to newlines and img to markdown images", () => {
    expect(inlineHtmlToMarkdown("a<br />b")).toBe("a\nb");
    expect(inlineHtmlToMarkdown('<img src="/f.png" alt="logo" />')).toBe("![logo](/f.png)");
  });
});

describe("blocksToMarkdown", () => {
  it("renders headings, paragraphs, lists, quotes, dividers, and code blocks", () => {
    const markdown = blocksToMarkdown([
      { type: "heading1", content: "Title", properties: null },
      { type: "text", content: "Intro <strong>text</strong>", properties: null },
      { type: "bulletList", content: "one", properties: null },
      { type: "bulletList", content: "two", properties: null },
      { type: "orderedList", content: "first", properties: null },
      { type: "orderedList", content: "second", properties: null },
      { type: "codeBlock", content: "const x = 1;", properties: { language: "ts" } },
      { type: "quote", content: "quoted line", properties: null },
      { type: "divider", content: null, properties: null },
    ]);

    expect(markdown).toContain("# Title");
    expect(markdown).toContain("Intro **text**");
    expect(markdown).toContain("- one\n\n- two");
    expect(markdown).toContain("1. first\n\n2. second");
    expect(markdown).toContain("```ts\nconst x = 1;\n```");
    expect(markdown).toContain("> quoted line");
    expect(markdown).toContain("---");
  });

  it("resets ordered list numbering after other blocks", () => {
    const markdown = blocksToMarkdown([
      { type: "orderedList", content: "a", properties: null },
      { type: "text", content: "break", properties: null },
      { type: "orderedList", content: "b", properties: null },
    ]);
    expect(markdown).toContain("1. a");
    expect(markdown).toContain("1. b");
  });

  it("renders BlockNote tables as GFM tables", () => {
    const tableJson = JSON.stringify({
      type: "tableContent",
      rows: [
        {
          cells: [
            { type: "text", text: "Name" },
            { type: "text", text: "Value" },
          ],
        },
        {
          cells: [
            { type: "text", text: "a|b" },
            { type: "text", text: "1" },
          ],
        },
      ],
    });
    const markdown = blocksToMarkdown([
      { type: "text", content: tableJson, properties: { blockNoteType: "table" } },
    ]);
    expect(markdown).toContain("| Name | Value |");
    expect(markdown).toContain("| --- | --- |");
    // Pipes in cell content are escaped
    expect(markdown).toContain("| a\\|b | 1 |");
  });

  it("renders image blocks", () => {
    const markdown = blocksToMarkdown([
      { type: "image", content: null, properties: { src: "/files/a.png", filename: "a.png" } },
    ]);
    expect(markdown).toBe("![a.png](/files/a.png)");
  });
});
