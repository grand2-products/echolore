import { describe, expect, it } from "vitest";
import {
  sanitizeBlockContent,
  sanitizeBlockProperties,
  sanitizeBlockType,
} from "./sanitize-block.js";

describe("sanitizeBlockType", () => {
  it("returns known types as-is", () => {
    expect(sanitizeBlockType("text")).toBe("text");
    expect(sanitizeBlockType("heading1")).toBe("heading1");
    expect(sanitizeBlockType("image")).toBe("image");
    expect(sanitizeBlockType("codeBlock")).toBe("codeBlock");
    expect(sanitizeBlockType("divider")).toBe("divider");
  });

  it("falls back to 'text' for unknown types", () => {
    expect(sanitizeBlockType("script")).toBe("text");
    expect(sanitizeBlockType("<script>")).toBe("text");
    expect(sanitizeBlockType("")).toBe("text");
  });
});

describe("sanitizeBlockContent", () => {
  it("preserves safe inline HTML", () => {
    expect(sanitizeBlockContent("<strong>bold</strong>")).toBe("<strong>bold</strong>");
    expect(sanitizeBlockContent("<em>italic</em>")).toBe("<em>italic</em>");
    expect(sanitizeBlockContent("<code>x</code>")).toBe("<code>x</code>");
    expect(sanitizeBlockContent("<u>underline</u>")).toBe("<u>underline</u>");
    expect(sanitizeBlockContent("<s>strike</s>")).toBe("<s>strike</s>");
    expect(sanitizeBlockContent("<del>deleted</del>")).toBe("<del>deleted</del>");
  });

  it("preserves safe links", () => {
    expect(sanitizeBlockContent('<a href="https://example.com">link</a>')).toBe(
      '<a href="https://example.com">link</a>'
    );
    expect(sanitizeBlockContent('<a href="mailto:a@b.com">email</a>')).toBe(
      '<a href="mailto:a@b.com">email</a>'
    );
  });

  it("strips script tags", () => {
    expect(sanitizeBlockContent("<script>alert(1)</script>")).toBe("");
    expect(sanitizeBlockContent('text<script>alert("xss")</script>more')).toBe("textmore");
  });

  it("strips event handlers", () => {
    expect(sanitizeBlockContent('<img onerror="alert(1)" src="x">')).toBe("");
  });

  it("strips javascript: URLs in links", () => {
    const result = sanitizeBlockContent('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain("javascript:");
  });

  it("strips iframe and object tags", () => {
    expect(sanitizeBlockContent('<iframe src="https://evil.com"></iframe>')).toBe("");
    expect(sanitizeBlockContent('<object data="evil.swf"></object>')).toBe("");
  });

  it("handles null/undefined/empty", () => {
    expect(sanitizeBlockContent(null)).toBeNull();
    expect(sanitizeBlockContent(undefined)).toBeNull();
    expect(sanitizeBlockContent("")).toBe("");
  });

  it("preserves plain text", () => {
    expect(sanitizeBlockContent("hello world")).toBe("hello world");
  });
});

describe("sanitizeBlockProperties", () => {
  it("sanitizes javascript: in URL fields", () => {
    expect(sanitizeBlockProperties({ src: "javascript:alert(1)" })).toEqual({ src: "" });
    expect(sanitizeBlockProperties({ href: "javascript:void(0)" })).toEqual({ href: "" });
    expect(sanitizeBlockProperties({ url: "data:text/html,<script>" })).toEqual({ url: "" });
  });

  it("preserves safe URLs", () => {
    expect(sanitizeBlockProperties({ src: "https://example.com/img.png" })).toEqual({
      src: "https://example.com/img.png",
    });
    expect(sanitizeBlockProperties({ href: "/api/files/abc" })).toEqual({
      href: "/api/files/abc",
    });
  });

  it("preserves non-URL fields", () => {
    expect(sanitizeBlockProperties({ language: "typescript", filename: "test.ts" })).toEqual({
      language: "typescript",
      filename: "test.ts",
    });
  });

  it("handles null/undefined", () => {
    expect(sanitizeBlockProperties(null)).toBeNull();
    expect(sanitizeBlockProperties(undefined)).toBeNull();
  });
});
