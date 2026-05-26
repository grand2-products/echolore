import { useCallback, useSyncExternalStore } from "react";

// Shared expansion state for the wiki page tree. Lives in an external store
// (rather than per-PageTree `useState`) so that:
//   - all PageTree instances stay in sync instead of clobbering the same
//     localStorage key with separate in-memory copies, and
//   - layout-level actions (e.g. creating a sub-page) can expand a parent so
//     the newly created child becomes visible in the tree.

const EXPANDED_KEY = "echolore:wiki:tree-expanded";

// ---------------------------------------------------------------------------
// Snapshot cache — useSyncExternalStore compares via Object.is, so we must
// return the same Set reference when the underlying data hasn't changed.
// ---------------------------------------------------------------------------
const EMPTY: ReadonlySet<string> = new Set();
let cache: ReadonlySet<string> = EMPTY;
let cacheInitialized = false;

function load(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): ReadonlySet<string> {
  if (!cacheInitialized) {
    cacheInitialized = true;
    cache = load();
  }
  return cache;
}

function getServerSnapshot(): ReadonlySet<string> {
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
  if (e.key === EXPANDED_KEY) {
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
/** Expand or collapse a single page in the wiki tree. No-op if already in the target state. */
export function setPageExpanded(id: string, expanded: boolean): void {
  const current = getSnapshot();
  if (expanded === current.has(id)) return;

  const next = new Set(current);
  if (expanded) next.add(id);
  else next.delete(id);

  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
  } catch {}

  // Eagerly update cache so the next getSnapshot() returns a stable reference.
  cache = next;
  cacheInitialized = true;
  emitChange();
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useWikiTreeExpansion() {
  const expandedIds = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setExpanded = useCallback((id: string, expanded: boolean) => {
    setPageExpanded(id, expanded);
  }, []);

  return { expandedIds, setExpanded };
}
