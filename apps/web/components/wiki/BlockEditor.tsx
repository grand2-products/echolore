"use client";

import type { BlockDto } from "@echolore/shared/contracts";
import dynamic from "next/dynamic";
import type { EditorHandle } from "./BlockEditorInner";

const BlockEditorInner = dynamic(() => import("./BlockEditorInner"), { ssr: false });

interface BlockEditorProps {
  pageId: string;
  initialBlocks: BlockDto[];
  pageTitle: string;
  onTitleChange: (title: string) => void;
  autoFocusTitle?: boolean;
  readOnly?: boolean;
  userName?: string;
  userColor?: string;
  onEditorReady?: (handle: EditorHandle) => void;
}

export type { EditorHandle };

export function BlockEditor(props: BlockEditorProps) {
  return <BlockEditorInner {...props} />;
}
