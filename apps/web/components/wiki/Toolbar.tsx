"use client";

import { useT } from "@/lib/i18n";
import type { Editor } from "@tiptap/react";

interface ToolbarProps {
  editor: Editor;
  onAttachFile?: () => void;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title: string;
}

function ToolbarButton({ onClick, isActive, disabled, children, title }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded p-2 transition ${
        isActive ? "bg-blue-100 text-blue-600" : "text-gray-600 hover:bg-gray-100"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-6 w-px bg-gray-200" />;
}

export function Toolbar({ editor, onAttachFile }: ToolbarProps) {
  const t = useT();

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 p-2">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        title={t("wiki.toolbar.bold")}
      >
        <span className="text-sm font-bold">B</span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        title={t("wiki.toolbar.italic")}
      >
        <span className="text-sm italic">I</span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive("strike")}
        title={t("wiki.toolbar.strike")}
      >
        <span className="text-sm line-through">S</span>
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive("heading", { level: 1 })}
        title={t("wiki.toolbar.heading1")}
      >
        <span className="text-sm font-bold">H1</span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive("heading", { level: 2 })}
        title={t("wiki.toolbar.heading2")}
      >
        <span className="text-sm font-bold">H2</span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive("heading", { level: 3 })}
        title={t("wiki.toolbar.heading3")}
      >
        <span className="text-sm font-bold">H3</span>
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        title={t("wiki.toolbar.bulletList")}
      >
        <span className="text-sm">{t("wiki.toolbar.bulletList")}</span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        title={t("wiki.toolbar.orderedList")}
      >
        <span className="text-sm">1.</span>
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive("blockquote")}
        title={t("wiki.toolbar.quote")}
      >
        <span className="text-sm">"</span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive("codeBlock")}
        title={t("wiki.toolbar.codeBlock")}
      >
        <span className="text-sm">{"</>"}</span>
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={() => {
          const url = window.prompt(t("wiki.toolbar.promptLink"));
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }}
        isActive={editor.isActive("link")}
        title={t("wiki.toolbar.link")}
      >
        <span className="text-sm">{t("wiki.toolbar.linkLabel")}</span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => {
          const url = window.prompt(t("wiki.toolbar.promptImage"));
          if (url) editor.chain().focus().setImage({ src: url }).run();
        }}
        title={t("wiki.toolbar.image")}
      >
        <span className="text-sm">{t("wiki.toolbar.imageLabel")}</span>
      </ToolbarButton>

      <ToolbarButton onClick={() => onAttachFile?.()} title={t("wiki.toolbar.attachFile")}>
        <span className="text-sm">{t("wiki.toolbar.fileLabel")}</span>
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title={t("wiki.toolbar.undo")}
      >
        <span className="text-sm">{t("wiki.toolbar.undoLabel")}</span>
      </ToolbarButton>

      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title={t("wiki.toolbar.redo")}
      >
        <span className="text-sm">{t("wiki.toolbar.redoLabel")}</span>
      </ToolbarButton>
    </div>
  );
}
