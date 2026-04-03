"use client";

import { type RefObject, useEffect, useRef } from "react";

/**
 * Scroll a sentinel element into view whenever `trigger` changes.
 * Useful for chat-style auto-scroll on new messages.
 */
export function useScrollIntoView(ref: RefObject<HTMLElement | null>, trigger: unknown) {
  const prevTrigger = useRef(trigger);
  useEffect(() => {
    if (prevTrigger.current !== trigger) {
      prevTrigger.current = trigger;
      ref.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [ref, trigger]);
}

/**
 * Scroll a container to bottom when near the bottom edge and `trigger` changes.
 * Useful for transcript panels where the user may have scrolled up.
 */
export function useAutoScrollNearBottom(
  ref: RefObject<HTMLElement | null>,
  trigger: unknown,
  threshold = 80
) {
  const prevTrigger = useRef(trigger);
  useEffect(() => {
    if (prevTrigger.current !== trigger) {
      prevTrigger.current = trigger;
      const el = ref.current;
      if (!el) return;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      if (isNearBottom) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [ref, trigger, threshold]);
}
