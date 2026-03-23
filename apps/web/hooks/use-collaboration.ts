"use client";

import { useEffect, useRef, useState } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { getPublicApiUrl } from "@/lib/runtime-env";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface UseCollaborationOptions {
  pageId: string;
  user: { name: string; color: string };
}

function getWsBaseUrl(): string {
  const apiUrl = getPublicApiUrl();
  const url = new URL(apiUrl);
  const protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${url.host}/api/ws/wiki/collab`;
}

interface CollabState {
  doc: Y.Doc;
  fragment: Y.XmlFragment;
  provider: WebsocketProvider;
  idb: IndexeddbPersistence;
}

/**
 * Manages Yjs collaboration state for a wiki page.
 *
 * Creates Y.Doc, WebsocketProvider, and IndexeddbPersistence inside useEffect
 * so that creation and cleanup are properly paired — required for React
 * StrictMode which remounts effects in development.
 */
export function useCollaboration({ pageId, user }: UseCollaborationOptions) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const stateRef = useRef<CollabState | null>(null);
  const [state, setState] = useState<CollabState | null>(null);

  // Create and destroy Yjs instances inside useEffect so StrictMode's
  // unmount/remount cycle correctly pairs creation with cleanup.
  useEffect(() => {
    const doc = new Y.Doc();
    const fragment = doc.getXmlFragment("document-store");
    const wsBaseUrl = getWsBaseUrl();
    const provider = new WebsocketProvider(wsBaseUrl, pageId, doc, {
      connect: true,
      disableBc: true,
    });
    const idb = new IndexeddbPersistence(`wiki-collab-${pageId}`, doc);

    const collab: CollabState = { doc, fragment, provider, idb };
    stateRef.current = collab;
    setState(collab);

    const onStatus = ({ status }: { status: string }) => {
      setConnectionStatus(
        status === "connected"
          ? "connected"
          : status === "connecting"
            ? "connecting"
            : "disconnected"
      );
    };
    provider.on("status", onStatus);

    return () => {
      provider.off("status", onStatus);
      provider.awareness.setLocalState(null);
      provider.disconnect();
      provider.destroy();
      idb.destroy();
      doc.destroy();
      stateRef.current = null;
    };
  }, [pageId]);

  // Update awareness user info without recreating the provider
  useEffect(() => {
    stateRef.current?.provider.awareness.setLocalStateField("user", {
      name: user.name,
      color: user.color,
    });
  }, [user.name, user.color]);

  return {
    doc: state?.doc ?? null,
    provider: state?.provider ?? null,
    fragment: state?.fragment ?? null,
    connectionStatus,
  };
}
