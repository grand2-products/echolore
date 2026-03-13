"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import type { Block as BlockNoteBlock } from "@blocknote/core";
import type { BlockDto } from "@contracts/index";
import {
  blockDtosToBlocks,
  blocksToBlockDtos,
  diffAndSave,
} from "@/lib/wiki-serializer";
import { wikiApi } from "@/lib/api";
import { useT } from "@/lib/i18n";

import "@blocknote/shadcn/style.css";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface NotionEditorInnerProps {
  pageId: string;
  initialBlocks: BlockDto[];
  pageTitle: string;
  onTitleChange: (title: string) => void;
  readOnly?: boolean;
}

export default function NotionEditorInner({
  pageId,
  initialBlocks,
  pageTitle,
  onTitleChange,
  readOnly = false,
}: NotionEditorInnerProps) {
  const t = useT();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const existingDtosRef = useRef<BlockDto[]>(initialBlocks);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const titleRef = useRef(pageTitle);

  const initialContent = blockDtosToBlocks(initialBlocks);

  const editor = useCreateBlockNote({
    initialContent: initialContent.length > 0 ? initialContent : undefined,
  });

  const saveBlocks = useCallback(async () => {
    if (!isDirtyRef.current) return;

    try {
      setSaveStatus("saving");
      const currentBlocks = editor.document as BlockNoteBlock[];
      const drafts = blocksToBlockDtos(currentBlocks);
      const updatedDtos = await diffAndSave(
        pageId,
        existingDtosRef.current,
        drafts,
      );
      existingDtosRef.current = updatedDtos;
      isDirtyRef.current = false;
      setSaveStatus("saved");
    } catch (error) {
      console.error("Auto-save failed", error);
      setSaveStatus("error");
    }
  }, [editor, pageId]);

  const scheduleSave = useCallback(() => {
    isDirtyRef.current = true;
    setSaveStatus("idle");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveBlocks();
    }, 2000);
  }, [saveBlocks]);

  // Editor onChange
  useEffect(() => {
    if (readOnly) return;
    editor.onChange(() => {
      scheduleSave();
    });
  }, [editor, readOnly, scheduleSave]);

  // Title change with debounced save
  const handleTitleChange = useCallback(
    (newTitle: string) => {
      titleRef.current = newTitle;
      onTitleChange(newTitle);

      if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
      titleTimerRef.current = setTimeout(async () => {
        try {
          setSaveStatus("saving");
          await wikiApi.updatePage(pageId, { title: newTitle });
          setSaveStatus("saved");
        } catch (error) {
          console.error("Title save failed", error);
          setSaveStatus("error");
        }
      }, 2000);
    },
    [onTitleChange, pageId],
  );

  // Title Enter -> focus editor
  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        editor.focus();
      }
    },
    [editor],
  );

  // Warn on unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    };
  }, []);

  const statusLabel =
    saveStatus === "saving"
      ? t("wiki.detail.saving")
      : saveStatus === "saved"
        ? t("wiki.detail.saved")
        : saveStatus === "error"
          ? t("wiki.detail.saveError")
          : null;

  return (
    <div className="notion-editor">
      {/* Title */}
      {readOnly ? (
        <h1 className="mb-2 border-none text-4xl font-bold text-gray-900 outline-none">
          {pageTitle}
        </h1>
      ) : (
        <input
          type="text"
          value={pageTitle}
          onChange={(e) => handleTitleChange(e.target.value)}
          onKeyDown={handleTitleKeyDown}
          placeholder={t("wiki.newPage.titlePlaceholder")}
          className="mb-2 w-full border-none text-4xl font-bold text-gray-900 outline-none placeholder:text-gray-300"
        />
      )}

      {/* Save status indicator */}
      {statusLabel && !readOnly ? (
        <div className="mb-3 flex justify-end">
          <span
            className={`rounded-full px-3 py-1 text-xs ${
              saveStatus === "error"
                ? "bg-red-100 text-red-700"
                : saveStatus === "saving"
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-emerald-100 text-emerald-700"
            }`}
          >
            {statusLabel}
          </span>
        </div>
      ) : null}

      {/* BlockNote Editor */}
      <BlockNoteView
        editor={editor}
        editable={!readOnly}
        theme="light"
      />
    </div>
  );
}
