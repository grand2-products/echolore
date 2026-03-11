"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export interface PageNode {
  id: string;
  title: string;
  parentId?: string;
  children?: PageNode[];
}

interface PageTreeItemProps {
  page: PageNode;
  level: number;
  activeId?: string;
  expandedIds: Set<string>;
  draggingId: string | null;
  dragOverId: string | null;
  onToggleExpand: (id: string, expanded: boolean) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (id: string) => void;
  onDropTo: (targetId: string) => void;
  onExpand?: (id: string, expanded: boolean) => void;
}

function PageTreeItem({
  page,
  level,
  activeId,
  expandedIds,
  draggingId,
  dragOverId,
  onToggleExpand,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDropTo,
  onExpand,
}: PageTreeItemProps) {
  const hasChildren = page.children && page.children.length > 0;
  const isExpanded = expandedIds.has(page.id);
  const isDragging = draggingId === page.id;
  const isDragOver = dragOverId === page.id;

  const handleToggle = () => {
    const next = !isExpanded;
    onToggleExpand(page.id, next);
    onExpand?.(page.id, next);
  };

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition ${
          activeId === page.id
            ? "bg-blue-50 text-blue-600"
            : "text-gray-700 hover:bg-gray-100"
        } ${isDragOver ? "ring-1 ring-blue-400" : ""} ${isDragging ? "opacity-50" : ""}`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        draggable
        onDragStart={() => onDragStart(page.id)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDragOver(page.id);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDropTo(page.id);
        }}
      >
        {/* Expand/Collapse Button */}
        {hasChildren ? (
          <button
            type="button"
            onClick={handleToggle}
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-gray-200"
          >
            <svg
              className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        ) : (
          <span className="h-5 w-5" />
        )}

        {/* Page Icon */}
        <span className="text-gray-400">
          {hasChildren ? "📁" : "📄"}
        </span>

        {/* Page Title */}
        <Link
          href={`/wiki/${page.id}`}
          className="flex-1 truncate"
        >
          {page.title}
        </Link>

        {/* Actions */}
        <div className="hidden group-hover:flex">
          <button
            type="button"
            className="rounded p-1 hover:bg-gray-200"
            title="子ページを作成"
          >
            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {page.children!.map((child) => (
            <PageTreeItem
              key={child.id}
              page={child}
              level={level + 1}
              activeId={activeId}
              expandedIds={expandedIds}
              draggingId={draggingId}
              dragOverId={dragOverId}
              onToggleExpand={onToggleExpand}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDropTo={onDropTo}
              onExpand={onExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface PageTreeProps {
  pages: PageNode[];
  activeId?: string;
  onExpand?: (id: string, expanded: boolean) => void;
  onReparent?: (pageId: string, parentId: string | null) => Promise<void> | void;
}

function flattenPageIds(nodes: PageNode[]): string[] {
  const result: string[] = [];

  for (const node of nodes) {
    result.push(node.id);
    if (node.children?.length) {
      result.push(...flattenPageIds(node.children));
    }
  }

  return result;
}

function collectDescendants(node: PageNode): Set<string> {
  const descendants = new Set<string>();

  for (const child of node.children ?? []) {
    descendants.add(child.id);
    const nested = collectDescendants(child);
    for (const nestedId of nested) {
      descendants.add(nestedId);
    }
  }

  return descendants;
}

function findNodeById(nodes: PageNode[], id: string): PageNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const found = findNodeById(node.children ?? [], id);
    if (found) {
      return found;
    }
  }
  return null;
}

export function PageTree({ pages, activeId, onExpand, onReparent }: PageTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const allIds = useMemo(() => flattenPageIds(pages), [pages]);

  useEffect(() => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      for (const id of allIds) {
        if (!next.has(id)) {
          next.add(id);
        }
      }
      return next;
    });
  }, [allIds]);

  const handleToggleExpand = (id: string, expanded: boolean) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (expanded) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleDropTo = async (targetId: string) => {
    if (!onReparent || !draggingId || draggingId === targetId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }

    const draggingNode = findNodeById(pages, draggingId);
    if (!draggingNode) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }

    const descendants = collectDescendants(draggingNode);
    if (descendants.has(targetId)) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }

    try {
      await onReparent(draggingId, targetId);
    } finally {
      setDraggingId(null);
      setDragOverId(null);
    }
  };

  const handleDropToRoot = async () => {
    if (!onReparent || !draggingId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }

    try {
      await onReparent(draggingId, null);
    } finally {
      setDraggingId(null);
      setDragOverId(null);
    }
  };

  return (
    <div
      className="space-y-0.5"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOverId(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        if (e.target !== e.currentTarget) {
          return;
        }
        void handleDropToRoot();
      }}
    >
      {pages.map((page) => (
        <PageTreeItem
          key={page.id}
          page={page}
          level={0}
          activeId={activeId}
          expandedIds={expandedIds}
          draggingId={draggingId}
          dragOverId={dragOverId}
          onToggleExpand={handleToggleExpand}
          onDragStart={(id) => setDraggingId(id)}
          onDragEnd={() => {
            setDraggingId(null);
            setDragOverId(null);
          }}
          onDragOver={(id) => setDragOverId(id)}
          onDropTo={(targetId) => {
            void handleDropTo(targetId);
          }}
          onExpand={onExpand}
        />
      ))}
    </div>
  );
}
