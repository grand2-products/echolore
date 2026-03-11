import { wikiApi, type Block } from "./api";

type BlockDraft = {
  type: string;
  content?: string;
  properties?: Record<string, unknown>;
  sortOrder: number;
};

function textOf(node: Element) {
  return node.textContent?.trim() ?? "";
}

function getWikiFileHref(pageId: string, fileId: string) {
  return `/api/wiki/${encodeURIComponent(pageId)}/files/${encodeURIComponent(fileId)}/download`;
}

function parseFileBlock(anchor: HTMLAnchorElement, pageId: string, sortOrder: number): BlockDraft {
  const href = anchor.getAttribute("href") ?? "";
  const match = href.match(/\/wiki\/([^/]+)\/files\/([^/]+)\/download$/);
  const content = textOf(anchor) || "Attachment";

  if (match && match[1] === pageId) {
    return {
      type: "file",
      content,
      properties: {
        fileId: match[2],
        filename: content,
        href,
      },
      sortOrder,
    };
  }

  return {
    type: "text",
    content,
    properties: { href },
    sortOrder,
  };
}

export function blocksToHtml(pageTitle: string, pageBlocks: Block[]): string {
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const body = pageBlocks
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((block) => {
      const text = escapeHtml(block.content ?? "");
      switch (block.type) {
        case "heading1":
          return `<h1>${text}</h1>`;
        case "heading2":
          return `<h2>${text}</h2>`;
        case "heading3":
          return `<h3>${text}</h3>`;
        case "bulletList":
          return `<ul><li>${text}</li></ul>`;
        case "orderedList":
          return `<ol><li>${text}</li></ol>`;
        case "codeBlock":
          return `<pre><code>${text}</code></pre>`;
        case "image": {
          const src =
            typeof block.properties?.src === "string" ? escapeHtml(block.properties.src) : "";
          const alt =
            typeof block.properties?.filename === "string"
              ? escapeHtml(block.properties.filename)
              : text;
          return src ? `<img src="${src}" alt="${alt}" />` : "";
        }
        case "file": {
          const href =
            typeof block.properties?.href === "string"
              ? escapeHtml(block.properties.href)
              : typeof block.properties?.fileId === "string"
                ? escapeHtml(getWikiFileHref(block.pageId, block.properties.fileId))
                : "";
          return href ? `<p><a href="${href}">${text || "Attachment"}</a></p>` : `<p>${text}</p>`;
        }
        default:
          return `<p>${text}</p>`;
      }
    })
    .join("");

  return body || `<h1>${pageTitle}</h1><p>Start writing the page content here.</p>`;
}

export function htmlToBlockDrafts(pageId: string, html: string): BlockDraft[] {
  if (typeof window === "undefined") {
    return [];
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const drafts: BlockDraft[] = [];

  for (const node of Array.from(doc.body.children)) {
    const sortOrder = drafts.length;
    const tag = node.tagName.toLowerCase();

    if (tag === "h1" || tag === "h2" || tag === "h3") {
      drafts.push({ type: tag.replace("h", "heading"), content: textOf(node), sortOrder });
      continue;
    }

    if (tag === "ul" || tag === "ol") {
      const blockType = tag === "ul" ? "bulletList" : "orderedList";
      const items = Array.from(node.querySelectorAll(":scope > li"));
      for (const item of items) {
        const content = textOf(item);
        if (!content) continue;
        drafts.push({
          type: blockType,
          content,
          sortOrder: drafts.length,
        });
      }
      continue;
    }

    if (tag === "pre") {
      drafts.push({
        type: "codeBlock",
        content: textOf(node),
        sortOrder,
      });
      continue;
    }

    if (tag === "img") {
      const src = node.getAttribute("src") ?? "";
      if (!src) continue;
      drafts.push({
        type: "image",
        content: node.getAttribute("alt") ?? "",
        properties: {
          src,
          filename: node.getAttribute("alt") ?? "",
        },
        sortOrder,
      });
      continue;
    }

    const anchor = node.querySelector("a");
    if (tag === "p" && anchor instanceof HTMLAnchorElement) {
      drafts.push(parseFileBlock(anchor, pageId, sortOrder));
      continue;
    }

    const content = textOf(node);
    if (!content) continue;

    drafts.push({
      type: "text",
      content,
      sortOrder,
    });
  }

  return drafts;
}

export async function syncPageBlocks(pageId: string, currentBlocks: Block[], html: string) {
  const nextDrafts = htmlToBlockDrafts(pageId, html);
  const existing = [...currentBlocks].sort((a, b) => a.sortOrder - b.sortOrder);

  for (let index = 0; index < nextDrafts.length; index += 1) {
    const draft = nextDrafts[index];
    if (!draft) continue;
    const current = existing[index];

    if (current) {
      await wikiApi.updateBlock(current.id, {
        type: draft.type,
        content: draft.content ?? null,
        properties: draft.properties ?? null,
        sortOrder: draft.sortOrder,
      });
      continue;
    }

    await wikiApi.createBlock({
      pageId,
      type: draft.type,
      content: draft.content,
      properties: draft.properties,
      sortOrder: draft.sortOrder,
    });
  }

  for (let index = nextDrafts.length; index < existing.length; index += 1) {
    const block = existing[index];
    if (!block) continue;
    await wikiApi.deleteBlock(block.id);
  }
}
