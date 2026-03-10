"use client";

import Link from "next/link";
import { useState } from "react";

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
  onExpand?: (id: string, expanded: boolean) => void;
}

function PageTreeItem({ page, level, activeId, onExpand }: PageTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = page.children && page.children.length > 0;

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
    onExpand?.(page.id, !isExpanded);
  };

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition ${
          activeId === page.id
            ? "bg-blue-50 text-blue-600"
            : "text-gray-700 hover:bg-gray-100"
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
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
}

export function PageTree({ pages, activeId, onExpand }: PageTreeProps) {
  return (
    <div className="space-y-0.5">
      {pages.map((page) => (
        <PageTreeItem
          key={page.id}
          page={page}
          level={0}
          activeId={activeId}
          onExpand={onExpand}
        />
      ))}
    </div>
  );
}

// Sample data for development
export const samplePages: PageNode[] = [
  {
    id: "home",
    title: "ホーム",
    children: [
      {
        id: "about",
        title: "会社概要",
        children: [
          { id: "mission", title: "ミッション" },
          { id: "vision", title: "ビジョン" },
        ],
      },
      {
        id: "team",
        title: "チーム紹介",
        children: [
          { id: "engineering", title: "エンジニアリング" },
          { id: "design", title: "デザイン" },
        ],
      },
    ],
  },
  {
    id: "projects",
    title: "プロジェクト",
    children: [
      {
        id: "project-a",
        title: "プロジェクトA",
        children: [
          { id: "project-a-spec", title: "仕様書" },
          { id: "project-a-meeting", title: "議事録" },
        ],
      },
      {
        id: "project-b",
        title: "プロジェクトB",
      },
    ],
  },
  {
    id: "meetings",
    title: "会議",
    children: [
      { id: "weekly", title: "週次定例" },
      { id: "monthly", title: "月次レビュー" },
    ],
  },
];
