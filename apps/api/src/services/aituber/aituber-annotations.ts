import { AITUBER_VALID_EMOTIONS, type AituberEmotionType } from "@echolore/shared/contracts";
import { getValidActionIdsSync } from "./motion-registry.js";

/**
 * Annotation tags emitted by the LLM at the head of every response.
 *
 *   [emotion:TYPE:INTENSITY][action:ACTION_ID] <text>
 *
 * - `emotion` drives the avatar's facial expression (intensity ∈ [0, 1])
 * - `action` plays a VRMA motion clip — only IDs known to `motion-registry`
 *   are accepted, the rest are dropped so the client never receives an
 *   unknown clip ID.
 * - Any duplicated annotations the LLM leaves trailing are stripped before
 *   the text is forwarded to TTS / viewers.
 *
 * Kept as a pure module: no IO, no LLM, no LiveKit — only string parsing
 * plus a synchronous lookup against the cached motion registry.
 */

const EMOTION_TAG_RE = /^\[emotion:(\w+):([\d.]+)\]\s*/;
const ACTION_TAG_RE = /^\[action:([\w-]+)\]\s*/;

const VALID_EMOTIONS: readonly AituberEmotionType[] = AITUBER_VALID_EMOTIONS;

function isAituberEmotionType(value: string): value is AituberEmotionType {
  return (VALID_EMOTIONS as readonly string[]).includes(value);
}

export interface ParsedAnnotations {
  text: string;
  emotion: { type: AituberEmotionType; intensity: number } | null;
  action: string | null;
}

export function parseAnnotations(rawText: string): ParsedAnnotations {
  let text = rawText;

  // Parse emotion tag at beginning
  let emotion: { type: AituberEmotionType; intensity: number } | null = null;
  const emotionMatch = text.match(EMOTION_TAG_RE);
  if (emotionMatch) {
    const type = emotionMatch[1] ?? "";
    const intensity = Math.min(Math.max(Number.parseFloat(emotionMatch[2] ?? "0"), 0), 1);
    if (isAituberEmotionType(type)) {
      emotion = { type, intensity };
    }
    text = text.slice(emotionMatch[0].length);
  }

  // Parse action tag — only accept IDs known to the loaded motion manifest.
  // If the manifest hasn't been preloaded yet (or the file is missing) the
  // action is dropped so we never broadcast an unknown clip ID to the client.
  let action: string | null = null;
  const actionMatch = text.match(ACTION_TAG_RE);
  if (actionMatch) {
    const actionId = actionMatch[1] ?? "";
    const validIds = getValidActionIdsSync();
    if (validIds?.has(actionId)) {
      action = actionId;
    }
    text = text.slice(actionMatch[0].length);
  }

  // Strip any remaining annotation tags at the beginning that LLM may have duplicated
  while (/^\[emotion:\w+:[\d.]+\]\s*/.test(text)) {
    text = text.replace(/^\[emotion:\w+:[\d.]+\]\s*/, "");
  }
  while (/^\[action:[\w-]+\]\s*/.test(text)) {
    text = text.replace(/^\[action:[\w-]+\]\s*/, "");
  }

  return { text: text.trim(), emotion, action };
}
