"use client";

import { type RefObject, useEffect, useRef } from "react";

/**
 * Scroll a sentinel element into view whenever `trigger` changes.
 * Useful for chat-style auto-scroll on new messages.
 */
export function useScrollIntoView(ref: RefObject<HTMLElement | null>, trigger: unknown) {
  const triggerRef = useRef(trigger);
  useEffect(() => {
    if (triggerRef.current !== trigger) {
      triggerRef.current = trigger;
      ref.current?.scrollIntoView({ behavior: "smooth" });
    }
  });
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
  const triggerRef = useRef(trigger);
  useEffect(() => {
    if (triggerRef.current !== trigger) {
      triggerRef.current = trigger;
      const el = ref.current;
      if (!el) return;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      if (isNearBottom) {
        el.scrollTop = el.scrollHeight;
      }
    }
  });
}
