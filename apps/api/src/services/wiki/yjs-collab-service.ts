import type { WSContext } from "hono/ws";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import type { SessionUser } from "../../lib/auth.js";
import { getPageBlocks } from "../../repositories/wiki/wiki-repository.js";
import { getYjsState, upsertYjsState } from "../../repositories/wiki/yjs-document-repository.js";
import { indexPage } from "./embedding-service.js";
import { createPageRevision } from "./wiki-service.js";
import { syncBlocksFromYDoc } from "./yjs-block-sync.js";

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const MSG_QUERY_AWARENESS = 3;

const PING_INTERVAL_MS = 15_000;
const PERSIST_DEBOUNCE_MS = 2_000;
const PERSIST_MAX_RETRIES = 3;
const PERSIST_RETRY_BASE_MS = 500;

interface ConnInfo {
  ws: WSContext;
  user: SessionUser;
  /** Awareness clientIDs controlled by this connection */
  controlledIds: Set<number>;
  /** Whether this connection produced any doc updates during its lifetime. */
  didEdit: boolean;
}

interface DocEntry {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WSContext, ConnInfo>;
  saveTimer: ReturnType<typeof setTimeout> | null;
  gcTimer: ReturnType<typeof setTimeout> | null;
  pingTimer: ReturnType<typeof setInterval> | null;
  /**
   * True while the doc is being populated from legacy blocks (page had blocks
   * but no Yjs state when first opened). Doc updates during this window are
   * the client bootstrapping the Y.Doc from initialBlocks, not a real edit —
   * so we suppress didEdit attribution to avoid crediting the first viewer
   * as the author of the entire page. Cleared after the first persist.
   */
  isMigrating: boolean;
}

const docs = new Map<string, DocEntry>();

function send(ws: WSContext, message: Uint8Array): void {
  try {
    ws.send(message as unknown as ArrayBuffer);
  } catch {
    // Connection may have closed
  }
}

function broadcast(entry: DocEntry, sender: WSContext | null, message: Uint8Array): void {
  for (const [connWs] of entry.conns) {
    if (connWs !== sender) {
      send(connWs, message);
    }
  }
}

/** Build an awareness broadcast message for keep-alive purposes. */
function buildAwarenessMessage(awareness: awarenessProtocol.Awareness): Uint8Array | null {
  const states = awareness.getStates();
  if (states.size === 0) return null;
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_AWARENESS);
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(states.keys()))
  );
  return encoding.toUint8Array(encoder);
}

async function getOrCreateDoc(pageId: string): Promise<DocEntry> {
  const existing = docs.get(pageId);
  if (existing) {
    if (existing.gcTimer) {
      clearTimeout(existing.gcTimer);
      existing.gcTimer = null;
    }
    return existing;
  }

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);

  const entry: DocEntry = {
    doc,
    awareness,
    conns: new Map(),
    saveTimer: null,
    gcTimer: null,
    pingTimer: null,
    isMigrating: false,
  };
  docs.set(pageId, entry);

  // Load persisted Yjs state, or detect legacy migration scenario.
  const savedState = await getYjsState(pageId);
  if (savedState) {
    Y.applyUpdate(doc, new Uint8Array(savedState));
  } else {
    // No saved Yjs state. If legacy blocks exist, the first client will
    // populate the Y.Doc from those blocks — that bootstrap should not be
    // attributed to the user as an edit.
    const legacyBlocks = await getPageBlocks(pageId);
    entry.isMigrating = legacyBlocks.length > 0;
  }

  // Broadcast doc updates to all connected clients (except origin)
  doc.on("update", (update: Uint8Array, origin: unknown) => {
    schedulePersist(pageId);

    // Track which user produced this update so we can attribute the
    // snapshot taken on their disconnect. Skip during legacy migration —
    // those updates come from the client bootstrap, not real user typing.
    if (origin && typeof origin === "object" && !entry.isMigrating) {
      const conn = entry.conns.get(origin as WSContext);
      if (conn) conn.didEdit = true;
    }

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const msg = encoding.toUint8Array(encoder);
    broadcast(entry, origin as WSContext | null, msg);
  });

  // Broadcast awareness changes to all connected clients (except origin)
  awareness.on(
    "update",
    (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown
    ) => {
      const changedClients = added.concat(updated, removed);
      if (changedClients.length === 0) return;

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
      );
      const msg = encoding.toUint8Array(encoder);
      broadcast(entry, origin as WSContext | null, msg);
    }
  );

  return entry;
}

function schedulePersist(pageId: string): void {
  const entry = docs.get(pageId);
  if (!entry) return;

  if (entry.saveTimer) clearTimeout(entry.saveTimer);
  entry.saveTimer = setTimeout(() => {
    void persistDoc(pageId);
  }, PERSIST_DEBOUNCE_MS);
}

async function persistDoc(pageId: string, retries = PERSIST_MAX_RETRIES): Promise<void> {
  const entry = docs.get(pageId);
  if (!entry) return;

  // Capture the doc state synchronously at the start so this persist operates
  // on a point-in-time snapshot, even if concurrent updates land during the
  // awaits below. Both the upsert and the block sync derive from this state,
  // so the blocks table consistently reflects the captured moment.
  const state = Y.encodeStateAsUpdate(entry.doc);
  const snapshotDoc = new Y.Doc();
  Y.applyUpdate(snapshotDoc, state);

  try {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await upsertYjsState(pageId, Buffer.from(state));
        await syncBlocksFromYDoc(pageId, snapshotDoc).catch((err) =>
          console.warn(`[yjs-collab] Block sync failed for ${pageId}:`, err)
        );

        // Once any persist completes successfully, the page is no longer in
        // legacy-migration state — future updates are genuine user edits.
        entry.isMigrating = false;
        return;
      } catch (err) {
        if (attempt < retries) {
          const delay = PERSIST_RETRY_BASE_MS * 2 ** (attempt - 1);
          console.warn(
            `[yjs-collab] Persist doc ${pageId} failed (attempt ${attempt}/${retries}), retrying in ${delay}ms`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          console.error(
            `[yjs-collab] Failed to persist doc ${pageId} after ${retries} attempts:`,
            err
          );
        }
      }
    }
  } finally {
    snapshotDoc.destroy();
  }
}

export async function addConnection(
  pageId: string,
  ws: WSContext,
  user: SessionUser
): Promise<void> {
  const entry = await getOrCreateDoc(pageId);
  entry.conns.set(ws, { ws, user, controlledIds: new Set(), didEdit: false });

  // Start ping timer when first client connects
  if (!entry.pingTimer) {
    entry.pingTimer = setInterval(() => {
      const msg = buildAwarenessMessage(entry.awareness);
      if (msg) broadcast(entry, null, msg);
    }, PING_INTERVAL_MS);
  }

  // Send sync step 1
  const syncEncoder = encoding.createEncoder();
  encoding.writeVarUint(syncEncoder, MSG_SYNC);
  syncProtocol.writeSyncStep1(syncEncoder, entry.doc);
  send(ws, encoding.toUint8Array(syncEncoder));

  // Send current awareness states
  const states = entry.awareness.getStates();
  if (states.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, MSG_AWARENESS);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(entry.awareness, Array.from(states.keys()))
    );
    send(ws, encoding.toUint8Array(awarenessEncoder));
  }
}

export function handleMessage(pageId: string, ws: WSContext, data: ArrayBuffer | string): void {
  const entry = docs.get(pageId);
  if (!entry) return;

  let uint8: Uint8Array;
  if (data instanceof ArrayBuffer) {
    uint8 = new Uint8Array(data);
  } else if (typeof data === "string") {
    uint8 = new TextEncoder().encode(data);
  } else {
    uint8 = new Uint8Array(data as ArrayBuffer);
  }

  try {
    const decoder = decoding.createDecoder(uint8);
    const msgType = decoding.readVarUint(decoder);

    switch (msgType) {
      case MSG_SYNC: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_SYNC);
        // Pass `ws` as transactionOrigin so doc.on('update') can exclude sender
        syncProtocol.readSyncMessage(decoder, encoder, entry.doc, ws);
        if (encoding.length(encoder) > 1) {
          send(ws, encoding.toUint8Array(encoder));
        }
        // Broadcasting is handled by doc.on('update')
        break;
      }

      case MSG_AWARENESS: {
        const update = decoding.readVarUint8Array(decoder);
        // Track which clientIDs this connection controls (for cleanup on close)
        trackControlledIds(entry, ws, update);
        // Pass `ws` as origin so awareness.on('update') can exclude sender
        awarenessProtocol.applyAwarenessUpdate(entry.awareness, update, ws);
        // Broadcasting is handled by awareness.on('update')
        break;
      }

      case MSG_QUERY_AWARENESS: {
        // Client is requesting full awareness state
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_AWARENESS);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(
            entry.awareness,
            Array.from(entry.awareness.getStates().keys())
          )
        );
        send(ws, encoding.toUint8Array(encoder));
        break;
      }
    }
  } catch (err) {
    console.error(`[yjs-collab] Error handling message for ${pageId}:`, err);
  }
}

/**
 * Parse an awareness update to extract clientIDs and track them per connection.
 * This allows us to clean up awareness states when a connection closes.
 */
function trackControlledIds(entry: DocEntry, ws: WSContext, update: Uint8Array): void {
  const conn = entry.conns.get(ws);
  if (!conn) return;

  try {
    const decoder = decoding.createDecoder(update);
    const len = decoding.readVarUint(decoder);
    for (let i = 0; i < len; i++) {
      const clientID = decoding.readVarUint(decoder);
      conn.controlledIds.add(clientID);
      decoding.readVarUint(decoder); // clock
      decoding.readVarString(decoder); // state JSON
    }
  } catch {
    // Malformed awareness update — skip tracking
  }
}

/**
 * Persist all in-memory documents to the database.
 * Called during graceful shutdown to avoid data loss.
 */
export async function shutdownCollab(): Promise<void> {
  const entries = Array.from(docs.entries());
  if (entries.length === 0) return;

  console.log(`[yjs-collab] Shutting down: persisting ${entries.length} document(s)`);
  await Promise.allSettled(
    entries.map(async ([pageId, entry]) => {
      if (entry.saveTimer) clearTimeout(entry.saveTimer);
      if (entry.gcTimer) clearTimeout(entry.gcTimer);
      if (entry.pingTimer) clearInterval(entry.pingTimer);
      await persistDoc(pageId, 1);
      entry.awareness.destroy();
      entry.doc.destroy();
    })
  );
  docs.clear();
  console.log("[yjs-collab] Shutdown complete");
}

export function removeConnection(pageId: string, ws: WSContext): void {
  const entry = docs.get(pageId);
  if (!entry) return;

  const conn = entry.conns.get(ws);

  // Remove awareness states controlled by this connection
  if (conn && conn.controlledIds.size > 0) {
    awarenessProtocol.removeAwarenessStates(entry.awareness, Array.from(conn.controlledIds), null);
  }

  entry.conns.delete(ws);
  const isLast = entry.conns.size === 0;

  // Cancel the pending debounced persist since we're about to run one
  // explicitly. Avoids a redundant DB write a few seconds after disconnect.
  if (entry.saveTimer) {
    clearTimeout(entry.saveTimer);
    entry.saveTimer = null;
  }

  // If this user actually edited during their session, persist the latest
  // Y.Doc state (which syncs blocks) and then snapshot a revision attributed
  // to them. This is what surfaces them as "last editor" in listings.
  if (conn?.didEdit) {
    const editor = conn.user;
    void persistDoc(pageId)
      .then(() => createPageRevision(pageId, editor.id))
      .then(() => {
        if (isLast) {
          return indexPage(pageId).catch((err) =>
            console.warn(`[yjs-collab] Embedding re-index failed for ${pageId}:`, err)
          );
        }
        return undefined;
      })
      .catch((err) =>
        console.warn(
          `[yjs-collab] Disconnect snapshot failed for page ${pageId} by user ${editor.id}:`,
          err
        )
      );
  } else if (isLast) {
    // Non-editing last viewer: still flush state and reindex.
    void persistDoc(pageId).then(() => {
      indexPage(pageId).catch((err) =>
        console.warn(`[yjs-collab] Embedding re-index failed for ${pageId}:`, err)
      );
    });
  }

  if (isLast) {
    // Stop ping timer when no clients are connected
    if (entry.pingTimer) {
      clearInterval(entry.pingTimer);
      entry.pingTimer = null;
    }

    entry.gcTimer = setTimeout(() => {
      const e = docs.get(pageId);
      if (e && e.conns.size === 0) {
        if (e.saveTimer) clearTimeout(e.saveTimer);
        if (e.pingTimer) {
          clearInterval(e.pingTimer);
          e.pingTimer = null;
        }
        e.awareness.destroy();
        e.doc.destroy();
        docs.delete(pageId);
      }
    }, 30_000);
  }
}
