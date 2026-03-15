"use client";

import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import type { BlockDto } from "@echolore/shared/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import type { WebsocketProvider } from "y-websocket";
import type { XmlFragment } from "yjs";
import { type ConnectionStatus, useCollaboration } from "@/hooks/use-collaboration";
import { filesApi, getWikiFileDownloadUrl, wikiApi } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { blockDtosToBlocks } from "@/lib/wiki-serializer";
import { CollaboratorAvatars } from "./CollaboratorAvatars";

import "@blocknote/shadcn/style.css";

interface NotionEditorInnerProps {
  pageId: string;
  initialBlocks: BlockDto[];
  pageTitle: string;
  onTitleChange: (title: string) => void;
  readOnly?: boolean;
  userName?: string;
  userColor?: string;
}

export default function NotionEditorInner({
  pageId,
  initialBlocks,
  pageTitle,
  onTitleChange,
  readOnly = false,
  userName = "User",
  userColor = "#3b82f6",
}: NotionEditorInnerProps) {
  const t = useT();
  const queryClient = useQueryClient();
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { provider, fragment, connectionStatus } = useCollaboration({
    pageId,
    user: { name: userName, color: userColor },
  });

  // Title change with debounced save
  const handleTitleChange = useCallback(
    (newTitle: string) => {
      onTitleChange(newTitle);

      if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
      titleTimerRef.current = setTimeout(async () => {
        try {
          await wikiApi.updatePage(pageId, { title: newTitle });
          void queryClient.invalidateQueries({ queryKey: ["wiki", "pages"] });
        } catch (error) {
          console.error("Title save failed", error);
        }
      }, 2000);
    },
    [onTitleChange, pageId, queryClient]
  );

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (titleTimerRef.current) clearTimeout(titleTimerRef.current);
    };
  }, []);

  const statusConfig = getStatusConfig(connectionStatus, t);

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
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          placeholder={t("wiki.newPage.titlePlaceholder")}
          className="mb-2 w-full border-none text-4xl font-bold text-gray-900 outline-none placeholder:text-gray-300"
        />
      )}

      {/* Connection status + collaborator avatars */}
      {!readOnly && (
        <div className="mb-3 flex items-center justify-between">
          {provider && <CollaboratorAvatars provider={provider} />}
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${statusConfig.className}`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${statusConfig.dotClassName}`} />
            {statusConfig.label}
          </span>
        </div>
      )}

      {/* BlockNote Editor — mount only after collab provider is ready */}
      {provider && fragment ? (
        <CollabEditor
          pageId={pageId}
          fragment={fragment}
          provider={provider}
          initialBlocks={initialBlocks}
          readOnly={readOnly}
          userName={userName}
          userColor={userColor}
        />
      ) : (
        <div className="flex h-32 items-center justify-center text-sm text-gray-400">
          {t("wiki.collab.connecting")}
        </div>
      )}
    </div>
  );
}

/** Inner editor component that requires a non-null provider/fragment. */
function CollabEditor({
  pageId,
  fragment,
  provider,
  initialBlocks,
  readOnly,
  userName,
  userColor,
}: {
  pageId: string;
  fragment: XmlFragment;
  provider: WebsocketProvider;
  initialBlocks: BlockDto[];
  readOnly: boolean;
  userName: string;
  userColor: string;
}) {
  const initialBlocksRef = useRef(initialBlocks);
  const pageIdRef = useRef(pageId);
  pageIdRef.current = pageId;

  const uploadFile = useCallback(async (file: File) => {
    const res = await filesApi.upload(file);
    return getWikiFileDownloadUrl(pageIdRef.current, res.file.id);
  }, []);

  const editor = useCreateBlockNote({
    collaboration: {
      fragment,
      user: { name: userName, color: userColor },
      // WebsocketProvider is structurally compatible with BlockNote's
      // expected provider shape ({ awareness?: Awareness }), but the
      // library's internal type is not exported. Cast via the expected shape.
      provider: provider as { awareness: WebsocketProvider["awareness"] },
    },
    uploadFile,
  });

  // Legacy migration: populate Y.Doc from blocks table on first sync
  useEffect(() => {
    if (initialBlocksRef.current.length === 0) return;

    const migrate = () => {
      if (fragment.length === 0 && initialBlocksRef.current.length > 0) {
        const blocks = blockDtosToBlocks(initialBlocksRef.current);
        if (blocks.length > 0) {
          editor.replaceBlocks(editor.document, blocks);
        }
      }
    };

    if (provider.synced) {
      migrate();
      return;
    }

    const onSync = (synced: boolean) => {
      if (synced) {
        migrate();
        provider.off("sync", onSync);
      }
    };
    provider.on("sync", onSync);
    return () => {
      provider.off("sync", onSync);
    };
  }, [provider, fragment, editor]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey) return;

      const cursor = editor.getTextCursorPosition();
      if (!cursor.block) return;

      const block = cursor.block;
      if (block.type !== "paragraph") return;

      // Extract inline text content from the block
      const text = Array.isArray(block.content)
        ? (block.content as Array<{ type: string; text?: string }>)
            .filter((i) => i.type === "text")
            .map((i) => i.text ?? "")
            .join("")
        : "";

      const match = text.match(/^```(\w*)$/);
      if (!match) return;

      event.preventDefault();
      const language = match[1] || undefined;
      // PartialBlock is a complex discriminated union that cannot be satisfied
      // by a dynamically constructed block literal; the assertion is required.
      editor.updateBlock(block, {
        type: "codeBlock",
        props: language ? { language } : {},
        content: "",
        // biome-ignore lint/suspicious/noExplicitAny: BlockNoteEditor types require casting for custom block updates
      } as any);
    },
    [editor]
  );

  return (
    <BlockNoteView
      editor={editor}
      editable={!readOnly}
      theme="light"
      onKeyDownCapture={handleKeyDown}
    />
  );
}

function getStatusConfig(
  status: ConnectionStatus,
  t: (key: string) => string
): { label: string; className: string; dotClassName: string } {
  switch (status) {
    case "connected":
      return {
        label: t("wiki.collab.live"),
        className: "bg-emerald-100 text-emerald-700",
        dotClassName: "bg-emerald-500",
      };
    case "connecting":
      return {
        label: t("wiki.collab.connecting"),
        className: "bg-yellow-100 text-yellow-700",
        dotClassName: "bg-yellow-500 animate-pulse",
      };
    case "disconnected":
      return {
        label: t("wiki.collab.offline"),
        className: "bg-gray-100 text-gray-600",
        dotClassName: "bg-gray-400",
      };
  }
}
