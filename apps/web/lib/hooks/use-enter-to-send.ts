"use client";

import type React from "react";
import { useCallback } from "react";

/**
 * Returns a `keydown` handler that calls `onSend` when Enter is pressed
 * without the Shift key (Shift+Enter inserts a newline).
 */
export function useEnterToSend(onSend: () => void): (e: React.KeyboardEvent) => void {
  return useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [onSend]
  );
}
