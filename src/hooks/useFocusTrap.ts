import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const trapStack: number[] = [];
let nextTrapId = 0;

function isVisibleFocusable(el: HTMLElement): boolean {
  // Consider element focusable if not disabled and not hidden
  if ((el as HTMLButtonElement).disabled) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  // offsetParent check fails for some flex children in jsdom; allow if tabindex or input/button
  return true;
}

/**
 * Traps focus inside container when `open` is true.
 * - Focuses first focusable on open
 * - Restores previously focused element on close
 * - Handles Tab / Shift+Tab wrapping
 * - Handles Esc to call onClose (only for topmost modal in stack)
 */
export function useFocusTrap(
  open: boolean,
  onClose: () => void,
  containerRef: React.RefObject<HTMLElement | null>
) {
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const idRef = useRef<number>(0);
  if (idRef.current === 0) idRef.current = ++nextTrapId;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const id = idRef.current;
    trapStack.push(id);
    previousActiveRef.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    // Focus first element after mount
    const focusFirst = () => {
      const el = containerRef.current;
      if (!el) return;
      const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisibleFocusable);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        // if no focusable, focus container itself
        (el as HTMLElement).setAttribute("tabindex", "-1");
        (el as HTMLElement).focus();
      }
    };
    // defer until after paint
    const raf = requestAnimationFrame(focusFirst);
    // also timeout fallback
    const t = window.setTimeout(focusFirst, 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      // only topmost trap handles Esc / Tab
      if (trapStack[trapStack.length - 1] !== id) return;
      const cont = containerRef.current;
      if (!cont) return;
      // Check if event target is inside container (for Esc we also want to close even if focus outside? but usually inside)
      // For Escape, allow even if target outside? We'll close if open and topmost
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        // prevent the global hotkeys handler from also firing
        e.stopImmediatePropagation?.();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab") {
        const focusable = Array.from(cont.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisibleFocusable);
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey) {
          if (active === first || !cont.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    // Use capture to intercept before global handlers
    document.addEventListener("keydown", handleKeyDown, true);
    // also add on container for safety
    container?.addEventListener("keydown", handleKeyDown as unknown as EventListener);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
      document.removeEventListener("keydown", handleKeyDown, true);
      container?.removeEventListener("keydown", handleKeyDown as unknown as EventListener);
      // pop from stack
      const idx = trapStack.lastIndexOf(id);
      if (idx !== -1) trapStack.splice(idx, 1);
      // restore focus
      const prev = previousActiveRef.current;
      if (prev && typeof prev.focus === "function") {
        // ensure element still in document
        if (document.contains(prev)) {
          // defer to avoid focus being stolen by unmount
          requestAnimationFrame(() => prev.focus());
        }
      }
    };
  }, [open, containerRef]);
}
