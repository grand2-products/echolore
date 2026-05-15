"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Page } from "@/lib/api";
import { useWikiPagesQuery } from "@/lib/api";
import { useT } from "@/lib/i18n";

interface PageHierarchyFooterProps {
  pageId: string;
}

interface HierarchyNode {
  id: string;
  title: string;
  children: HierarchyNode[];
}

function buildDescendants(
  pageId: string,
  childrenByParent: Map<string, Page[]>,
  remainingDepth: number
): HierarchyNode[] {
  if (remainingDepth <= 0) return [];
  return (childrenByParent.get(pageId) ?? []).map((child) => ({
    id: child.id,
    title: child.title,
    children: buildDescendants(child.id, childrenByParent, remainingDepth - 1),
  }));
}

export function PageHierarchyFooter({ pageId }: PageHierarchyFooterProps) {
  const t = useT();
  const { data, isLoading } = useWikiPagesQuery();

  const view = useMemo(() => {
    const pages = data?.pages ?? [];
    const byId = new Map<string, Page>(pages.map((p) => [p.id, p]));
    const current = byId.get(pageId);
    if (!current) return null;

    // Ancestors (parent, grandparent), nearest first. Restricted to the same space.
    const ancestors: Page[] = [];
    let cursor: Page | undefined = current.parentId ? byId.get(current.parentId) : undefined;
    while (cursor && cursor.spaceId === current.spaceId && ancestors.length < 2) {
      ancestors.push(cursor);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }

    const childrenByParent = new Map<string, Page[]>();
    for (const p of pages) {
      if (p.spaceId !== current.spaceId) continue;
      if (!p.parentId) continue;
      const bucket = childrenByParent.get(p.parentId) ?? [];
      bucket.push(p);
      childrenByParent.set(p.parentId, bucket);
    }

    const descendants = buildDescendants(current.id, childrenByParent, 2);

    if (ancestors.length === 0 && descendants.length === 0) return null;

    return {
      ancestors: ancestors.reverse(), // topmost first: grandparent → parent
      current,
      descendants,
    };
  }, [data, pageId]);

  // Reserve vertical space while the page list is loading to avoid layout shift
  // when the footer pops in after the query resolves.
  if (isLoading && !view) {
    return <div aria-hidden="true" className="mt-12 min-h-[6rem]" />;
  }

  if (!view) return null;

  const currentLevel = view.ancestors.length + 1;

  return (
    <nav
      aria-label={t("wiki.detail.hierarchyTitle")}
      className="mt-12 border-t border-gray-200 pt-6 text-sm"
    >
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">
        {t("wiki.detail.hierarchyTitle")}
      </h2>
      <div role="tree" className="space-y-1">
        {view.ancestors.map((ancestor, index) => (
          <HierarchyRow
            key={ancestor.id}
            id={ancestor.id}
            title={ancestor.title}
            level={index + 1}
          />
        ))}
        <HierarchyRow
          id={view.current.id}
          title={view.current.title}
          level={currentLevel}
          isCurrent
        />
        {view.descendants.map((child) => (
          <DescendantRow key={child.id} node={child} level={currentLevel + 1} />
        ))}
      </div>
    </nav>
  );
}

function HierarchyRow({
  id,
  title,
  level,
  isCurrent,
}: {
  id: string;
  title: string;
  level: number;
  isCurrent?: boolean;
}) {
  const t = useT();
  const label = title || t("wiki.newPage.defaultTitle");
  const paddingLeft = `${(level - 1) * 16}px`;

  return (
    <div
      role="treeitem"
      tabIndex={-1}
      aria-level={level}
      aria-current={isCurrent ? "page" : undefined}
      style={{ paddingLeft }}
    >
      {isCurrent ? (
        <span className="font-medium text-gray-900">{label}</span>
      ) : (
        <Link href={`/wiki/${id}`} className="text-gray-600 hover:text-blue-600 hover:underline">
          {label}
        </Link>
      )}
    </div>
  );
}

function DescendantRow({ node, level }: { node: HierarchyNode; level: number }) {
  return (
    <>
      <HierarchyRow id={node.id} title={node.title} level={level} />
      {node.children.map((grand) => (
        <DescendantRow key={grand.id} node={grand} level={level + 1} />
      ))}
    </>
  );
}
