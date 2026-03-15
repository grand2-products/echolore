"use client";

import { useT } from "@/lib/i18n";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface PageNode {
  id: string;
  title: string;
  parentId?: string;
  spaceId?: string;
  children?: PageNode[];
}

/* ------------------------------------------------------------------ */
/*  Three-dot action menu                                             */
/* ------------------------------------------------------------------ */

interface PageActionMenuProps {
  page: PageNode;
  onAddSubPage?: (parentId: string, spaceId?: string) => void;
  onRename?: (pageId: string, currentTitle: string) => void;
  onMoveToRoot?: (pageId: string) => void;
  onDelete?: (pageId: string) => void;
}

function PageActionMenu({
  page,
  onAddSubPage,
  onRename,
  onMoveToRoot,
  onDelete,
}: PageActionMenuProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="flex h-5 w-5 items-center justify-center rounded opacity-0 transition hover:bg-gray-200 group-hover:opacity-100"
        aria-label={t("wiki.tree.actions")}
      >
        <svg
          className="h-3.5 w-3.5 text-gray-500"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-6 z-50 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {onAddSubPage && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onAddSubPage(page.id, page.spaceId);
              }}
            >
              <svg
                className="h-3.5 w-3.5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              {t("wiki.tree.addSubPage")}
            </button>
          )}
          {onRename && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onRename(page.id, page.title);
              }}
            >
              <svg
                className="h-3.5 w-3.5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z"
                />
              </svg>
              {t("wiki.tree.rename")}
            </button>
          )}
          {onMoveToRoot && page.parentId && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onMoveToRoot(page.id);
              }}
            >
              <svg
                className="h-3.5 w-3.5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-3L16.5 18m0 0L12 13.5m4.5 4.5V6"
                />
              </svg>
              {t("wiki.tree.moveToRoot")}
            </button>
          )}
          {(onAddSubPage || onRename || (onMoveToRoot && page.parentId)) && onDelete && (
            <div className="my-1 border-t border-gray-100" />
          )}
          {onDelete && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onDelete(page.id);
              }}
            >
              <svg
                className="h-3.5 w-3.5 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                />
              </svg>
              {t("wiki.tree.delete")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline rename input                                               */
/* ------------------------------------------------------------------ */

interface InlineRenameProps {
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}

function InlineRename({ initialValue, onSave, onCancel }: InlineRenameProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const trimmed = value.trim();
          if (trimmed && trimmed !== initialValue) onSave(trimmed);
          else onCancel();
        }
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => {
        const trimmed = value.trim();
        if (trimmed && trimmed !== initialValue) onSave(trimmed);
        else onCancel();
      }}
      className="flex-1 rounded border border-blue-300 bg-white px-1 py-0 text-sm text-gray-900 outline-none focus:ring-1 focus:ring-blue-400"
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Page tree item                                                    */
/* ------------------------------------------------------------------ */

interface PageTreeItemProps {
  page: PageNode;
  level: number;
  activeId?: string;
  expandedIds: Set<string>;
  draggingId: string | null;
  dragOverId: string | null;
  renamingId: string | null;
  onToggleExpand: (id: string, expanded: boolean) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (id: string) => void;
  onDropTo: (targetId: string) => void;
  onExpand?: (id: string, expanded: boolean) => void;
  onAddSubPage?: (parentId: string, spaceId?: string) => void;
  onRename?: (pageId: string, currentTitle: string) => void;
  onRenameSubmit?: (pageId: string, newTitle: string) => void;
  onRenameCancel?: () => void;
  onMoveToRoot?: (pageId: string) => void;
  onDelete?: (pageId: string) => void;
}

function PageTreeItem(props: PageTreeItemProps) {
  const hasChildren = (props.page.children?.length ?? 0) > 0;
  const isExpanded = props.expandedIds.has(props.page.id);
  const isDragging = props.draggingId === props.page.id;
  const isDragOver = props.dragOverId === props.page.id;
  const isRenaming = props.renamingId === props.page.id;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition ${
          props.activeId === props.page.id
            ? "bg-blue-50 text-blue-600"
            : "text-gray-700 hover:bg-gray-100"
        } ${isDragOver ? "ring-1 ring-blue-400" : ""} ${isDragging ? "opacity-50" : ""}`}
        style={{ paddingLeft: `${props.level * 8 + 4}px` }}
        draggable={!isRenaming}
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
            className="flex h-4 w-4 items-center justify-center rounded hover:bg-gray-200"
          >
            <svg
              className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <span className="w-3" />
        )}

        {isRenaming ? (
          <InlineRename
            initialValue={props.page.title}
            onSave={(newTitle) => props.onRenameSubmit?.(props.page.id, newTitle)}
            onCancel={() => props.onRenameCancel?.()}
          />
        ) : (
          <Link href={`/wiki/${props.page.id}`} className="flex-1 truncate">
            {props.page.title}
          </Link>
        )}

        {!isRenaming && (
          <PageActionMenu
            page={props.page}
            onAddSubPage={props.onAddSubPage}
            onRename={props.onRename}
            onMoveToRoot={props.onMoveToRoot}
            onDelete={props.onDelete}
          />
        )}
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

/* ------------------------------------------------------------------ */
/*  Page tree                                                         */
/* ------------------------------------------------------------------ */

interface PageTreeProps {
  pages: PageNode[];
  activeId?: string;
  onExpand?: (id: string, expanded: boolean) => void;
  onReparent?: (pageId: string, parentId: string | null) => Promise<void> | void;
  onAddSubPage?: (parentId: string, spaceId?: string) => void;
  onRenamePage?: (pageId: string, newTitle: string) => Promise<void> | void;
  onDeletePage?: (pageId: string) => Promise<void> | void;
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

export function PageTree({
  pages,
  activeId,
  onExpand,
  onReparent,
  onAddSubPage,
  onRenamePage,
  onDeletePage,
}: PageTreeProps) {
  const t = useT();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
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

  const handleRename = useCallback((pageId: string, _currentTitle: string) => {
    setRenamingId(pageId);
  }, []);

  const handleRenameSubmit = useCallback(
    async (pageId: string, newTitle: string) => {
      setRenamingId(null);
      await onRenamePage?.(pageId, newTitle);
    },
    [onRenamePage]
  );

  const handleRenameCancel = useCallback(() => {
    setRenamingId(null);
  }, []);

  const handleMoveToRoot = useCallback(
    (pageId: string) => {
      void onReparent?.(pageId, null);
    },
    [onReparent]
  );

  const handleDelete = useCallback(
    (pageId: string) => {
      const confirmed = window.confirm(t("wiki.tree.deleteConfirm"));
      if (!confirmed) return;
      void onDeletePage?.(pageId);
    },
    [onDeletePage, t]
  );

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
          renamingId={renamingId}
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
          onAddSubPage={onAddSubPage}
          onRename={handleRename}
          onRenameSubmit={handleRenameSubmit}
          onRenameCancel={handleRenameCancel}
          onMoveToRoot={onReparent ? handleMoveToRoot : undefined}
          onDelete={onDeletePage ? handleDelete : undefined}
        />
      ))}
    </div>
  );
}
