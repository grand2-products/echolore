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
let cache: { raw: string | null; parsed: RecentWikiPage[] } = { raw: null, parsed: EMPTY };

function getSnapshot(): RecentWikiPage[] {
  const raw = localStorage.getItem(KEY);
  if (raw !== cache.raw) {
    try {
      cache = { raw, parsed: raw ? (JSON.parse(raw) as RecentWikiPage[]) : EMPTY };
    } catch {
      cache = { raw, parsed: EMPTY };
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
  if (e.key === KEY) emitChange();
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
  const raw = JSON.stringify(pages);
  localStorage.setItem(KEY, raw);
  // Eagerly update cache so the next getSnapshot() returns a stable reference
  cache = { raw, parsed: pages };
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

  const removeEntry = useCallback((id: string) => {
    save(getSnapshot().filter((p) => p.id !== id));
  }, []);

  return { recentPages: pages, recordVisit, removeEntry };
}
