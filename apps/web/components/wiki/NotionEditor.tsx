"use client";

import dynamic from "next/dynamic";
import type { BlockDto } from "@contracts/index";

const NotionEditorInner = dynamic(
  () => import("./NotionEditorInner"),
  { ssr: false },
);

interface NotionEditorProps {
  pageId: string;
  initialBlocks: BlockDto[];
  pageTitle: string;
  onTitleChange: (title: string) => void;
  readOnly?: boolean;
  userName?: string;
  userColor?: string;
}

export function NotionEditor(props: NotionEditorProps) {
  return <NotionEditorInner {...props} />;
}
