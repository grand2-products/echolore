import type { PageNode } from "@/components/wiki";
import type { Page, Space } from "@/lib/api";

function buildPageTree(flatPages: Page[]): PageNode[] {
  const nodeMap = new Map<string, PageNode>();

  for (const page of flatPages) {
    nodeMap.set(page.id, {
      id: page.id,
      title: page.title,
      parentId: page.parentId ?? undefined,
      spaceId: page.spaceId,
      children: [],
    });
  }

  const roots: PageNode[] = [];

  for (const page of flatPages) {
    const node = nodeMap.get(page.id);
    if (!node) continue;

    if (page.parentId) {
      const parent = nodeMap.get(page.parentId);
      if (parent) {
        parent.children = parent.children ?? [];
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Resolve a user-facing label for a space. "general" and "personal" spaces
 * get translated labels; team/custom spaces fall back to the raw name.
 */
export function resolveSpaceLabel(
  space: Pick<Space, "type" | "name">,
  t: (key: string, values?: Record<string, string | number>) => string
): string {
  if (space.type === "general") return t("wiki.spaces.general");
  if (space.type === "personal") return t("wiki.spaces.personal", { name: space.name });
  return space.name;
}

export function groupPagesBySpace(pages: Page[], spaces: Space[]): Record<string, PageNode[]> {
  const grouped: Record<string, Page[]> = {};
  for (const space of spaces) {
    grouped[space.id] = [];
  }
  for (const page of pages) {
    const bucket = grouped[page.spaceId] ?? [];
    bucket.push(page);
    grouped[page.spaceId] = bucket;
  }

  const result: Record<string, PageNode[]> = {};
  for (const [spaceId, spacePages] of Object.entries(grouped)) {
    result[spaceId] = buildPageTree(spacePages);
  }
  return result;
}
