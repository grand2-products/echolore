import { type RefObject, useEffect } from "react";

/**
 * Close a dropdown/popover when clicking outside the container or pressing Escape.
 */
export function useClickOutside(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [ref, onClose]);
}
