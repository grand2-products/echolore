import type { LocalVideoTrack } from "livekit-client";
import { STORAGE_KEYS } from "./constants/storage-keys";

export type BackgroundEffect =
  | "none"
  | "blur-light"
  | "blur"
  | { type: "image"; url: string };

export interface PresetBackground {
  id: string;
  category: string;
  url: string;
}

export const BACKGROUND_CATEGORIES = ["office", "interior", "nature", "creative", "tech", "seasonal"] as const;

export const PRESET_BACKGROUNDS: PresetBackground[] = [
  // Office
  { id: "office-modern", category: "office", url: "/virtual-backgrounds/office-modern.webp" },
  { id: "office-home", category: "office", url: "/virtual-backgrounds/office-home.webp" },
  { id: "office-meeting-room", category: "office", url: "/virtual-backgrounds/office-meeting-room.webp" },
  { id: "office-coworking", category: "office", url: "/virtual-backgrounds/office-coworking.webp" },
  // Interior
  { id: "interior-nordic", category: "interior", url: "/virtual-backgrounds/interior-nordic.webp" },
  { id: "interior-midcentury", category: "interior", url: "/virtual-backgrounds/interior-midcentury.webp" },
  { id: "interior-cafe", category: "interior", url: "/virtual-backgrounds/interior-cafe.webp" },
  { id: "interior-library", category: "interior", url: "/virtual-backgrounds/interior-library.webp" },
  // Nature
  { id: "nature-forest", category: "nature", url: "/virtual-backgrounds/nature-forest.webp" },
  { id: "nature-mountain", category: "nature", url: "/virtual-backgrounds/nature-mountain.webp" },
  { id: "nature-beach", category: "nature", url: "/virtual-backgrounds/nature-beach.webp" },
  { id: "nature-japanese-garden", category: "nature", url: "/virtual-backgrounds/nature-japanese-garden.webp" },
  // Creative
  { id: "creative-atelier", category: "creative", url: "/virtual-backgrounds/creative-atelier.webp" },
  { id: "creative-gallery", category: "creative", url: "/virtual-backgrounds/creative-gallery.webp" },
  { id: "creative-music-studio", category: "creative", url: "/virtual-backgrounds/creative-music-studio.webp" },
  // Tech
  { id: "tech-cyberpunk", category: "tech", url: "/virtual-backgrounds/tech-cyberpunk.webp" },
  { id: "tech-lab", category: "tech", url: "/virtual-backgrounds/tech-lab.webp" },
  { id: "tech-space-station", category: "tech", url: "/virtual-backgrounds/tech-space-station.webp" },
  // Seasonal
  { id: "seasonal-sakura", category: "seasonal", url: "/virtual-backgrounds/seasonal-sakura.webp" },
  { id: "seasonal-christmas", category: "seasonal", url: "/virtual-backgrounds/seasonal-christmas.webp" },
];

/** Serialize effect for localStorage */
function serializeEffect(effect: BackgroundEffect): string {
  if (typeof effect === "string") return effect;
  return JSON.stringify(effect);
}

/** Deserialize effect from localStorage */
function deserializeEffect(raw: string): BackgroundEffect {
  if (raw === "none" || raw === "blur" || raw === "blur-light") return raw;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.type === "image" && typeof parsed.url === "string") return parsed;
  } catch {
    // invalid JSON
  }
  return "none";
}

export function getStoredBackgroundEffect(): BackgroundEffect {
  if (typeof window === "undefined") return "none";
  const stored = localStorage.getItem(STORAGE_KEYS.backgroundEffect);
  if (!stored) return "none";
  return deserializeEffect(stored);
}

export function storeBackgroundEffect(effect: BackgroundEffect) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.backgroundEffect, serializeEffect(effect));
}

/** Get user-added custom background URLs from localStorage */
export function getCustomBackgrounds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.customBackgrounds);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    // ignore
  }
  return [];
}

/** Add a custom background (data URL) to localStorage */
export function addCustomBackground(dataUrl: string) {
  const list = getCustomBackgrounds();
  list.unshift(dataUrl);
  // Keep max 10 custom backgrounds
  localStorage.setItem(STORAGE_KEYS.customBackgrounds, JSON.stringify(list.slice(0, 10)));
}

/** Remove a custom background from localStorage */
export function removeCustomBackground(dataUrl: string) {
  const list = getCustomBackgrounds().filter((u) => u !== dataUrl);
  localStorage.setItem(STORAGE_KEYS.customBackgrounds, JSON.stringify(list));
}

export function effectEquals(a: BackgroundEffect, b: BackgroundEffect): boolean {
  if (typeof a === "string" && typeof b === "string") return a === b;
  if (typeof a === "object" && typeof b === "object") return a.url === b.url;
  return false;
}

export async function applyBackgroundEffect(
  track: LocalVideoTrack,
  effect: BackgroundEffect,
) {
  // Remove any existing processor first
  try {
    await track.stopProcessor();
  } catch {
    // no processor was active — that's fine
  }

  if (effect === "none") return;

  if (effect === "blur" || effect === "blur-light") {
    const { BackgroundBlur } = await import("@livekit/track-processors");
    const BLUR_RADIUS = { blur: 30, "blur-light": 12 } as const;
    const blurRadius = BLUR_RADIUS[effect as "blur" | "blur-light"];
    const processor = BackgroundBlur(blurRadius);
    await track.setProcessor(processor);
    return;
  }

  // Virtual background image
  const { VirtualBackground } = await import("@livekit/track-processors");
  const processor = VirtualBackground(effect.url);
  await track.setProcessor(processor);
}
