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

function PageTreeItem(props: PageTreeItemProps) {
  const hasChildren = (props.page.children?.length ?? 0) > 0;
  const isExpanded = props.expandedIds.has(props.page.id);
  const isDragging = props.draggingId === props.page.id;
  const isDragOver = props.dragOverId === props.page.id;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition ${
          props.activeId === props.page.id
            ? "bg-blue-50 text-blue-600"
            : "text-gray-700 hover:bg-gray-100"
        } ${isDragOver ? "ring-1 ring-blue-400" : ""} ${isDragging ? "opacity-50" : ""}`}
        style={{ paddingLeft: `${props.level * 12 + 8}px` }}
        draggable
        onDragStart={() => props.onDragStart(props.page.id)}
        onDragEnd={props.onDragEnd}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          props.onDragOver(props.page.id);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          props.onDropTo(props.page.id);
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => {
              const next = !isExpanded;
              props.onToggleExpand(props.page.id, next);
              props.onExpand?.(props.page.id, next);
            }}
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-gray-200"
          >
            <svg
              className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <span className="h-5 w-5" />
        )}

        <span className="text-gray-400">{hasChildren ? ">" : "-"}</span>

        <Link href={`/wiki/${props.page.id}`} className="flex-1 truncate">
          {props.page.title}
        </Link>
      </div>

      {hasChildren && isExpanded ? (
        <div>
          {props.page.children?.map((child) => (
            <PageTreeItem key={child.id} {...props} page={child} level={props.level + 1} />
          ))}
        </div>
      ) : null}
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
    if (node.children?.length) result.push(...flattenPageIds(node.children));
  }
  return result;
}

function collectDescendants(node: PageNode): Set<string> {
  const descendants = new Set<string>();
  for (const child of node.children ?? []) {
    descendants.add(child.id);
    for (const nestedId of collectDescendants(child)) descendants.add(nestedId);
  }
  return descendants;
}

function findNodeById(nodes: PageNode[], id: string): PageNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(node.children ?? [], id);
    if (found) return found;
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
      for (const id of allIds) next.add(id);
      return next;
    });
  }, [allIds]);

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

    if (collectDescendants(draggingNode).has(targetId)) {
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

  return (
    <div
      className="space-y-0.5"
      onDragOver={(event) => {
        event.preventDefault();
        setDragOverId(null);
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (event.target !== event.currentTarget || !onReparent || !draggingId) return;
        void onReparent(draggingId, null);
        setDraggingId(null);
        setDragOverId(null);
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
          onToggleExpand={(id, expanded) =>
            setExpandedIds((prev) => {
              const next = new Set(prev);
              if (expanded) next.add(id);
              else next.delete(id);
              return next;
            })
          }
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
