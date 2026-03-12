"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { Toolbar } from "./Toolbar";
import { filesApi, getWikiFileDownloadUrl, wikiApi, type Block } from "@/lib/api";
import { useApiErrorMessage } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n";

interface WikiEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  placeholder?: string;
  editable?: boolean;
  pageId?: string;
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

export function WikiEditor({
  content = "",
  onChange,
  placeholder,
  editable = true,
  pageId,
}: WikiEditorProps) {
  const t = useT();
  const getApiErrorMessage = useApiErrorMessage();
  const [savedBlocks, setSavedBlocks] = useState<Block[]>([]);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<"image" | "file">("file");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);

  const resolvedPlaceholder = placeholder ?? t("wiki.editor.defaultPlaceholder");

  useEffect(() => {
    const fetchBlocks = async () => {
      if (!pageId) return;
      try {
        const res = await wikiApi.getPage(pageId);
        setSavedBlocks(res.blocks);
      } catch (error) {
        console.error("Failed to fetch blocks", error);
        setAssetError(getApiErrorMessage(error, t("wiki.detail.loadError")));
      }
    };

    void fetchBlocks();
  }, [getApiErrorMessage, pageId, t]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Image.configure({ HTMLAttributes: { class: "rounded-lg max-w-full shadow-sm" } }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: { class: "text-blue-600 underline hover:text-blue-800" },
      }),
      Placeholder.configure({ placeholder: resolvedPlaceholder }),
    ],
    content,
    editable,
    onUpdate: ({ editor: current }) => onChange?.(current.getHTML()),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none min-h-[300px] p-4 focus:outline-none",
      },
      handleDrop: (_view, event) => {
        if (!editable || !pageId) return false;
        const files = Array.from(event.dataTransfer?.files ?? []);
        const image = files.find(isImageFile);
        if (!image) return false;
        event.preventDefault();
        dragDepthRef.current = 0;
        setIsDraggingImage(false);
        void insertImageAsset(image);
        return true;
      },
      handlePaste: (_view, event) => {
        if (!editable || !pageId) return false;
        const files = Array.from(event.clipboardData?.files ?? []);
        const image = files.find(isImageFile);
        if (!image) return false;
        event.preventDefault();
        void insertImageAsset(image);
        return true;
      },
    },
  }, [content, editable, onChange, resolvedPlaceholder]);

  const createBlock = async (type: string, blockContent?: string, properties?: Record<string, unknown>) => {
    if (!pageId) return;

    try {
      const res = await wikiApi.createBlock({
        pageId,
        type,
        content: blockContent,
        properties,
        sortOrder: savedBlocks.length,
      });

      setSavedBlocks((prev) =>
        [...prev, res.block]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((block, index) => ({ ...block, sortOrder: index }))
      );
    } catch (error) {
      console.error("Failed to create block", error);
      setAssetError(getApiErrorMessage(error, t("wiki.detail.saveError")));
    }
  };

  const insertImageAsset = async (file: File) => {
    if (!pageId || !editor) return;

    setIsUploadingAsset(true);
    setAssetError(null);
    try {
      const { file: fileData } = await filesApi.upload(file);
      const src = getWikiFileDownloadUrl(pageId, fileData.id);

      editor.chain().focus().setImage({ src, alt: fileData.filename }).run();
      await createBlock("image", fileData.filename, {
        fileId: fileData.id,
        filename: fileData.filename,
        src,
      });
    } catch (error) {
      console.error("Failed to insert image", error);
      setAssetError(t("wiki.editor.imageUploadError"));
    } finally {
      setIsUploadingAsset(false);
    }
  };

  const attachFileAsset = async (file: File) => {
    if (!pageId || !editor) return;

    setIsUploadingAsset(true);
    setAssetError(null);
    try {
      const { file: fileData } = await filesApi.upload(file);
      const downloadUrl = getWikiFileDownloadUrl(pageId, fileData.id);

      editor.chain().focus().insertContent(`<p><a href="${downloadUrl}">${fileData.filename}</a></p>`).run();
      await createBlock("file", fileData.filename, {
        fileId: fileData.id,
        filename: fileData.filename,
        href: downloadUrl,
        gcsPath: fileData.gcsPath,
      });
    } catch (error) {
      console.error("Failed to attach file", error);
      setAssetError(t("wiki.editor.fileUploadError"));
    } finally {
      setIsUploadingAsset(false);
    }
  };

  if (!editor) return null;

  const moveBlock = async (blockId: string, direction: "up" | "down") => {
    const sorted = [...savedBlocks].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = sorted.findIndex((block) => block.id === blockId);
    if (index === -1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    const swapped = [...sorted];
    const current = swapped[index];
    const target = swapped[targetIndex];
    if (!current || !target) return;

    swapped[index] = target;
    swapped[targetIndex] = current;

    const normalized = swapped.map((block, idx) => ({ ...block, sortOrder: idx }));
    setSavedBlocks(normalized);

    try {
      const first = normalized[index];
      const second = normalized[targetIndex];
      if (!first || !second) return;

      await Promise.all([
        wikiApi.updateBlock(first.id, { sortOrder: first.sortOrder }),
        wikiApi.updateBlock(second.id, { sortOrder: second.sortOrder }),
      ]);
    } catch (error) {
      console.error("Failed to reorder blocks", error);
      setSavedBlocks(sorted);
      setAssetError(getApiErrorMessage(error, t("wiki.detail.saveError")));
    }
  };

  const deleteSavedBlock = async (id: string) => {
    const previous = [...savedBlocks];
    const normalized = previous
      .filter((block) => block.id !== id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((block, index) => ({ ...block, sortOrder: index }));

    setSavedBlocks(normalized);

    try {
      await wikiApi.deleteBlock(id);
      const changed = normalized.filter(
        (block) => previous.find((prev) => prev.id === block.id)?.sortOrder !== block.sortOrder
      );
      await Promise.all(changed.map((block) => wikiApi.updateBlock(block.id, { sortOrder: block.sortOrder })));
    } catch (error) {
      console.error("Failed to delete block", error);
      setSavedBlocks(previous);
      setAssetError(getApiErrorMessage(error, t("wiki.detail.saveError")));
    }
  };

  const handleDropBlock = async (targetBlockId: string) => {
    if (!draggingBlockId || draggingBlockId === targetBlockId) return;

    const sorted = [...savedBlocks].sort((a, b) => a.sortOrder - b.sortOrder);
    const dragIndex = sorted.findIndex((block) => block.id === draggingBlockId);
    const targetIndex = sorted.findIndex((block) => block.id === targetBlockId);
    if (dragIndex < 0 || targetIndex < 0) return;

    const reordered = [...sorted];
    const dragged = reordered[dragIndex];
    if (!dragged) return;

    reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, dragged);

    const normalized = reordered.map((block, idx) => ({ ...block, sortOrder: idx }));
    setSavedBlocks(normalized);
    setDraggingBlockId(null);

    try {
      const changed = normalized.filter(
        (block) => sorted.find((prev) => prev.id === block.id)?.sortOrder !== block.sortOrder
      );
      await Promise.all(changed.map((block) => wikiApi.updateBlock(block.id, { sortOrder: block.sortOrder })));
    } catch (error) {
      console.error("Failed to reorder blocks by drag and drop", error);
      setSavedBlocks(sorted);
      setAssetError(getApiErrorMessage(error, t("wiki.detail.saveError")));
    }
  };

  const handleEditorDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!editable) return;
    const files = Array.from(event.dataTransfer.files ?? []);
    if (!files.some(isImageFile)) return;
    dragDepthRef.current += 1;
    setIsDraggingImage(true);
  };

  const handleEditorDragLeave = () => {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingImage(false);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {editable ? (
        <Toolbar
          editor={editor}
          onAttachFile={() => {
            setPickerMode("file");
            fileInputRef.current?.click();
          }}
        />
      ) : null}
      {editable && pageId ? (
        <div className="flex flex-wrap gap-2 border-b border-gray-200 px-3 py-2">
          <button
            type="button"
            onClick={async () => {
              editor.chain().focus().toggleHeading({ level: 2 }).run();
              await createBlock("heading2", "New heading");
            }}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
          >
            {t("wiki.editor.addHeading")}
          </button>
          <button
            type="button"
            onClick={async () => {
              editor.chain().focus().toggleBulletList().run();
              await createBlock("bulletList", "New list item");
            }}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
          >
            {t("wiki.editor.addBulletList")}
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
          >
            {t("wiki.editor.addNumberedList")}
          </button>
          <button
            type="button"
            onClick={() => {
              setPickerMode("image");
              fileInputRef.current?.click();
            }}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
          >
            {t("wiki.editor.insertImage")}
          </button>
          <button
            type="button"
            onClick={async () => {
              editor.chain().focus().toggleCodeBlock().run();
              await createBlock("codeBlock", "// code");
            }}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
          >
            {t("wiki.editor.addCodeBlock")}
          </button>
          <button
            type="button"
            onClick={() => {
              setPickerMode("file");
              fileInputRef.current?.click();
            }}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
          >
            {t("wiki.editor.attachFile")}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={
              pickerMode === "image"
                ? "image/*"
                : "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
            }
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                if (isImageFile(file)) void insertImageAsset(file);
                else void attachFileAsset(file);
              }
              setPickerMode("file");
              event.currentTarget.value = "";
            }}
          />
        </div>
      ) : null}
      <div
        className="relative"
        onDragEnter={handleEditorDragEnter}
        onDragLeave={handleEditorDragLeave}
        onDragOver={(event) => {
          if (editable) event.preventDefault();
        }}
        onDrop={() => {
          dragDepthRef.current = 0;
          setIsDraggingImage(false);
        }}
      >
        {editable && isDraggingImage ? (
          <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/90 text-sm font-medium text-blue-700">
            {t("wiki.editor.dragImage")}
          </div>
        ) : null}
        {editable && isUploadingAsset ? (
          <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-full bg-slate-900 px-3 py-1 text-xs text-white">
            {t("wiki.editor.uploadingAsset")}
          </div>
        ) : null}
        <EditorContent editor={editor} />
      </div>
      {assetError ? (
        <div className="border-t border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {assetError}
        </div>
      ) : null}
      {editable && pageId && savedBlocks.length > 0 ? (
        <div className="border-t border-gray-200 p-3">
          <p className="mb-2 text-xs text-gray-500">
            {t("wiki.editor.savedBlocksHint")}
          </p>
          <div className="space-y-1">
            {[...savedBlocks]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((block, index, arr) => (
                <div
                  key={block.id}
                  draggable
                  onDragStart={() => setDraggingBlockId(block.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    void handleDropBlock(block.id);
                  }}
                  className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-sm"
                >
                  <span className="truncate text-gray-700">
                    {block.type}: {block.content ?? t("wiki.editor.emptyBlock")}
                  </span>
                  <div className="ml-3 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void moveBlock(block.id, "up")}
                      disabled={index === 0}
                      className="rounded border px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t("wiki.editor.moveUp")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void moveBlock(block.id, "down")}
                      disabled={index === arr.length - 1}
                      className="rounded border px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t("wiki.editor.moveDown")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSavedBlock(block.id)}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      {t("wiki.editor.delete")}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export type { Editor };
