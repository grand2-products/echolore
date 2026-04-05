import { useCallback, useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@/lib/constants/storage-keys";

export interface RecentWikiPage {
  id: string;
  title: string;
  visitedAt: number;
}

const MAX_ENTRIES = 20;
const KEY = STORAGE_KEYS.recentWikiPages;

// ---------------------------------------------------------------------------
// Snapshot cache — useSyncExternalStore compares via Object.is, so we must
// return the same reference when the underlying data hasn't changed.
// ---------------------------------------------------------------------------
const EMPTY: RecentWikiPage[] = [];
let cache: { parsed: RecentWikiPage[] } = { parsed: EMPTY };
let cacheInitialized = false;

function getSnapshot(): RecentWikiPage[] {
  if (!cacheInitialized) {
    cacheInitialized = true;
    const raw = localStorage.getItem(KEY);
    try {
      cache = { parsed: raw ? (JSON.parse(raw) as RecentWikiPage[]) : EMPTY };
    } catch {
      cache = { parsed: EMPTY };
    }
  }
  return cache.parsed;
}

function getServerSnapshot(): RecentWikiPage[] {
  return EMPTY;
}

// ---------------------------------------------------------------------------
// Subscription — notifies React on same-tab writes AND cross-tab storage events
// ---------------------------------------------------------------------------
let listeners: Array<() => void> = [];

function emitChange() {
  for (const listener of listeners) listener();
}

// Single module-scoped handler so addEventListener/removeEventListener
// always reference the same function identity.
function onStorage(e: StorageEvent) {
  if (e.key === KEY) {
    // Another tab wrote to this key — invalidate cache so the next
    // getSnapshot() re-reads from localStorage.
    cacheInitialized = false;
    emitChange();
  }
}

function subscribe(listener: () => void): () => void {
  listeners = [...listeners, listener];

  if (listeners.length === 1) {
    window.addEventListener("storage", onStorage);
  }

  return () => {
    listeners = listeners.filter((l) => l !== listener);
    if (listeners.length === 0) {
      window.removeEventListener("storage", onStorage);
    }
  };
}

// ---------------------------------------------------------------------------
// Write helper
// ---------------------------------------------------------------------------
function save(pages: RecentWikiPage[]): void {
  localStorage.setItem(KEY, JSON.stringify(pages));
  // Eagerly update cache so the next getSnapshot() returns a stable reference
  cache = { parsed: pages };
  cacheInitialized = true;
  emitChange();
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useRecentWikiPages() {
  const pages = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const recordVisit = useCallback((id: string, title: string) => {
    const current = getSnapshot();
    const filtered = current.filter((p) => p.id !== id);
    const next: RecentWikiPage[] = [{ id, title, visitedAt: Date.now() }, ...filtered].slice(
      0,
      MAX_ENTRIES
    );
    save(next);
  }, []);

  return { recentPages: pages, recordVisit };
}
