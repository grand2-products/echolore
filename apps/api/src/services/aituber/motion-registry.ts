import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface MotionClip {
  id: string;
  file: string;
  category: string;
  description: string;
  tags?: string[];
  duration?: number;
  loop?: boolean;
}

export interface MotionManifest {
  clips: MotionClip[];
}

interface ResolvedRegistry {
  manifest: MotionManifest;
  registry: Record<string, MotionClip[]>;
  validIds: Set<string>;
  promptListing: string;
}

let cache: ResolvedRegistry | null = null;
let pendingLoad: Promise<ResolvedRegistry> | null = null;

/**
 * Candidate manifest locations, tried in order.
 *
 * Dev runs from `apps/api`, dogfood/prod copies the file into the API image
 * via Docker. The first existing path wins; if none exist, an empty manifest
 * is returned so the backend doesn't crash — actions just won't be advertised.
 */
function manifestCandidates(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    process.env.AITUBER_MOTION_MANIFEST,
    path.resolve(process.cwd(), "../web/public/motions/manifest.json"),
    path.resolve(process.cwd(), "../../apps/web/public/motions/manifest.json"),
    path.resolve(here, "../../../../web/public/motions/manifest.json"),
    path.resolve(process.cwd(), "public/motions/manifest.json"),
  ].filter((p): p is string => typeof p === "string" && p.length > 0);
}

async function readManifest(): Promise<MotionManifest> {
  for (const candidate of manifestCandidates()) {
    if (!existsSync(candidate)) continue;
    try {
      const raw = await fs.readFile(candidate, "utf-8");
      const parsed = JSON.parse(raw) as MotionManifest;
      if (Array.isArray(parsed?.clips)) {
        return parsed;
      }
      console.warn(`[motion-registry] Manifest at ${candidate} missing clips[]`);
    } catch (err) {
      console.warn(`[motion-registry] Failed to read ${candidate}:`, err);
    }
  }
  console.warn("[motion-registry] No motion manifest found — action tags will be disabled");
  return { clips: [] };
}

function buildRegistry(manifest: MotionManifest): ResolvedRegistry {
  const registry: Record<string, MotionClip[]> = {};
  for (const clip of manifest.clips) {
    if (!clip?.id || !clip?.category) continue;
    const bucket = registry[clip.category] ?? [];
    bucket.push(clip);
    registry[clip.category] = bucket;
  }
  const validIds = new Set(manifest.clips.map((c) => c.id));
  const promptListing = Object.entries(registry)
    .map(([category, clips]) => `${category}: ${clips.map((c) => c.id).join(", ")}`)
    .join("\n");
  return { manifest, registry, validIds, promptListing };
}

/**
 * Load (and cache) the motion manifest from disk.
 *
 * Concurrent callers share the same in-flight read. Subsequent calls reuse the
 * cached result; call `clearMotionRegistryCache()` to force a reload (tests only).
 */
export async function loadMotionRegistry(): Promise<ResolvedRegistry> {
  if (cache) return cache;
  if (pendingLoad) return pendingLoad;
  pendingLoad = (async () => {
    const manifest = await readManifest();
    cache = buildRegistry(manifest);
    pendingLoad = null;
    return cache;
  })();
  return pendingLoad;
}

/**
 * Synchronous lookup against the cached registry. Returns `null` before the
 * first `loadMotionRegistry()` call completes; callers should fall back to
 * treating the action tag as invalid in that case.
 */
export function getValidActionIdsSync(): Set<string> | null {
  return cache?.validIds ?? null;
}

/** @internal Test-only — reset the cache so the next load reads disk again. */
export function clearMotionRegistryCache(): void {
  cache = null;
  pendingLoad = null;
}

/** @internal Test-only — install a registry without touching the filesystem. */
export function _seedMotionRegistry(manifest: MotionManifest): void {
  cache = buildRegistry(manifest);
}
