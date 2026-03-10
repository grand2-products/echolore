"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Toolbar } from "./Toolbar";
import { filesApi, wikiApi, type Block } from "@/lib/api";

interface WikiEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  placeholder?: string;
  editable?: boolean;
  pageId?: string;
}

export function WikiEditor({
  content = "",
  onChange,
  placeholder = "入力を開始するか、/ でコマンドを表示...",
  editable = true,
  pageId,
}: WikiEditorProps) {
  const [savedBlocks, setSavedBlocks] = useState<Block[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: "rounded-lg max-w-full",
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
    },
  });

  if (!editor) {
    return null;
  }

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
      setSavedBlocks((prev) => [...prev, res.block]);
    } catch (error) {
      console.error("Failed to create block", error);
    }
  };

  const deleteSavedBlock = async (id: string) => {
    try {
      await wikiApi.deleteBlock(id);
      setSavedBlocks((prev) => prev.filter((block) => block.id !== id));
    } catch (error) {
      console.error("Failed to delete block", error);
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
    const src = window.prompt("画像URLを入力してください:");
    if (!src) return;

    editor.chain().focus().setImage({ src }).run();
    await createBlock("image", "画像", { src });
  };

  const handleAddCodeBlock = async () => {
    editor.chain().focus().toggleCodeBlock().run();
    await createBlock("codeBlock", "// code");
  };

  const handleAttachFile = async (file: File) => {
    if (!pageId) return;

    try {
      const uploaderId = "demo-user";
      const { file: fileData } = await filesApi.upload(file, uploaderId);

      editor.chain().focus().insertContent(`<p><a href=\"${fileData.gcsPath}\">📎 ${fileData.filename}</a></p>`).run();
      await createBlock("file", fileData.filename, {
        fileId: fileData.id,
        filename: fileData.filename,
        gcsPath: fileData.gcsPath,
      });
    } catch (error) {
      console.error("Failed to attach file", error);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {editable && (
        <Toolbar
          editor={editor}
          onAttachFile={() => {
            fileInputRef.current?.click();
          }}
        />
      )}
      {editable && pageId && (
        <div className="flex flex-wrap gap-2 border-b border-gray-200 px-3 py-2">
          <button type="button" onClick={handleAddHeading} className="rounded border px-2 py-1 text-sm hover:bg-gray-50">見出し追加</button>
          <button type="button" onClick={handleAddList} className="rounded border px-2 py-1 text-sm hover:bg-gray-50">箇条書き追加</button>
          <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className="rounded border px-2 py-1 text-sm hover:bg-gray-50">番号付きリスト追加</button>
          <button type="button" onClick={handleAddImage} className="rounded border px-2 py-1 text-sm hover:bg-gray-50">画像追加</button>
          <button type="button" onClick={handleAddCodeBlock} className="rounded border px-2 py-1 text-sm hover:bg-gray-50">コード追加</button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded border px-2 py-1 text-sm hover:bg-gray-50">ファイル添付</button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void handleAttachFile(file);
              }
              e.currentTarget.value = "";
            }}
          />
        </div>
      )}
      <EditorContent editor={editor} />
      {editable && pageId && savedBlocks.length > 0 && (
        <div className="border-t border-gray-200 p-3">
          <p className="mb-2 text-xs text-gray-500">保存済みブロック</p>
          <div className="space-y-1">
            {savedBlocks.map((block) => (
              <div key={block.id} className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-sm">
                <span className="truncate text-gray-700">{block.type}: {block.content ?? "(empty)"}</span>
                <button type="button" onClick={() => void deleteSavedBlock(block.id)} className="text-xs text-red-600 hover:text-red-700">削除</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export type { Editor };

