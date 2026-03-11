"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import { Toolbar } from "./Toolbar";
import { filesApi, getWikiFileDownloadUrl, wikiApi, type Block } from "@/lib/api";

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
  placeholder = "ここにコンテンツを入力...",
  editable = true,
  pageId,
}: WikiEditorProps) {
  const [savedBlocks, setSavedBlocks] = useState<Block[]>([]);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);
  const [pickerMode, setPickerMode] = useState<"image" | "file">("file");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    const fetchBlocks = async () => {
      if (!pageId) return;

      try {
        const res = await wikiApi.getPage(pageId);
        setSavedBlocks(res.blocks);
      } catch (error) {
        console.error("Failed to fetch blocks", error);
      }
    };

    void fetchBlocks();
  }, [pageId]);

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
    }
  };

  const insertImageAsset = async (file: File) => {
    if (!pageId) return;

    setIsUploadingAsset(true);

    try {
      const { file: fileData } = await filesApi.upload(file);
      const src = getWikiFileDownloadUrl(pageId, fileData.id);

      editor?.chain().focus().setImage({ src, alt: fileData.filename }).run();
      await createBlock("image", fileData.filename, {
        fileId: fileData.id,
        filename: fileData.filename,
        src,
      });
    } catch (error) {
      console.error("Failed to insert image", error);
    } finally {
      setIsUploadingAsset(false);
    }
  };

  const attachFileAsset = async (file: File) => {
    if (!pageId) return;

    setIsUploadingAsset(true);

    try {
      const { file: fileData } = await filesApi.upload(file);
      const downloadUrl = getWikiFileDownloadUrl(pageId, fileData.id);

      editor?.chain().focus().insertContent(`<p><a href="${downloadUrl}">${fileData.filename}</a></p>`).run();
      await createBlock("file", fileData.filename, {
        fileId: fileData.id,
        filename: fileData.filename,
        gcsPath: fileData.gcsPath,
      });
    } catch (error) {
      console.error("Failed to attach file", error);
    } finally {
      setIsUploadingAsset(false);
    }
  };

  const handleAssetSelection = async (file: File) => {
    if (isImageFile(file)) {
      await insertImageAsset(file);
      return;
    }

    await attachFileAsset(file);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: "rounded-lg max-w-full shadow-sm",
        },
      }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: {
          class: "text-blue-600 underline hover:text-blue-800",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none min-h-[300px] p-4 focus:outline-none",
      },
      handleDrop: (_view, event) => {
        if (!editable || !pageId || !(event instanceof DragEvent)) {
          return false;
        }

        const files = Array.from(event.dataTransfer?.files ?? []);
        const image = files.find(isImageFile);
        if (!image) {
          return false;
        }

        event.preventDefault();
        dragDepthRef.current = 0;
        setIsDraggingImage(false);
        void insertImageAsset(image);
        return true;
      },
      handlePaste: (_view, event) => {
        if (!editable || !pageId) {
          return false;
        }

        const files = Array.from(event.clipboardData?.files ?? []);
        const image = files.find(isImageFile);
        if (!image) {
          return false;
        }

        event.preventDefault();
        void insertImageAsset(image);
        return true;
      },
    },
  });

  if (!editor) {
    return null;
  }

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
    }
  };

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
      if (!first || !second) {
        setSavedBlocks(sorted);
        return;
      }

      await Promise.all([
        wikiApi.updateBlock(first.id, { sortOrder: first.sortOrder }),
        wikiApi.updateBlock(second.id, { sortOrder: second.sortOrder }),
      ]);
    } catch (error) {
      console.error("Failed to reorder blocks", error);
      setSavedBlocks(sorted);
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
    }
  };

  const handleAddHeading = async () => {
    editor.chain().focus().toggleHeading({ level: 2 }).run();
    await createBlock("heading2", "新しい見出し");
  };

  const handleAddList = async () => {
    editor.chain().focus().toggleBulletList().run();
    await createBlock("bulletList", "新しいリスト項目");
  };

  const handleAddImage = async () => {
    setPickerMode("image");
    fileInputRef.current?.click();
  };

  const handleAddCodeBlock = async () => {
    editor.chain().focus().toggleCodeBlock().run();
    await createBlock("codeBlock", "// code");
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
    if (dragDepthRef.current === 0) {
      setIsDraggingImage(false);
    }
  };

  const handleEditorDrop = () => {
    dragDepthRef.current = 0;
    setIsDraggingImage(false);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {editable && (
        <Toolbar
          editor={editor}
          onAttachFile={() => {
            setPickerMode("file");
            fileInputRef.current?.click();
          }}
        />
      )}
      {editable && pageId && (
        <div className="flex flex-wrap gap-2 border-b border-gray-200 px-3 py-2">
          <button
            type="button"
            onClick={handleAddHeading}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
          >
            見出し追加
          </button>
          <button
            type="button"
            onClick={handleAddList}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
          >
            箇条書き追加
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
          >
            番号付きリスト
          </button>
          <button
            type="button"
            onClick={handleAddImage}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
          >
            画像追加
          </button>
          <button
            type="button"
            onClick={handleAddCodeBlock}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
          >
            コード追加
          </button>
          <button
            type="button"
            onClick={() => {
              setPickerMode("file");
              fileInputRef.current?.click();
            }}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-50"
          >
            ファイル添付
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={pickerMode === "image" ? "image/*" : "image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void handleAssetSelection(file);
              }
              setPickerMode("file");
              e.currentTarget.value = "";
            }}
          />
        </div>
      )}
      <div
        className="relative"
        onDragEnter={handleEditorDragEnter}
        onDragLeave={handleEditorDragLeave}
        onDragOver={(e) => {
          if (editable) {
            e.preventDefault();
          }
        }}
        onDrop={handleEditorDrop}
      >
        {editable && isDraggingImage && (
          <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/90 text-sm font-medium text-blue-700">
            画像をドロップして記事内に挿入
          </div>
        )}
        {editable && isUploadingAsset && (
          <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-full bg-slate-900 px-3 py-1 text-xs text-white">
            アップロード中...
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
      {editable && pageId && savedBlocks.length > 0 && (
        <div className="border-t border-gray-200 p-3">
          <p className="mb-2 text-xs text-gray-500">保存済みブロック</p>
          <div className="space-y-1">
            {[...savedBlocks]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((block, index, arr) => (
                <div
                  key={block.id}
                  draggable
                  onDragStart={() => setDraggingBlockId(block.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    void handleDropBlock(block.id);
                  }}
                  className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-sm"
                >
                  <span className="truncate text-gray-700">
                    {block.type}: {block.content ?? "(empty)"}
                  </span>
                  <div className="ml-3 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void moveBlock(block.id, "up")}
                      disabled={index === 0}
                      className="rounded border px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      上へ
                    </button>
                    <button
                      type="button"
                      onClick={() => void moveBlock(block.id, "down")}
                      disabled={index === arr.length - 1}
                      className="rounded border px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      下へ
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSavedBlock(block.id)}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      削除
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export type { Editor };
