"use client";

import type { BlockDto } from "@echolore/shared/contracts";
import dynamic from "next/dynamic";

const NotionEditorInner = dynamic(() => import("./NotionEditorInner"), { ssr: false });

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
