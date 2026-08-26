import { useEffect, useRef } from "react";

export type HotkeyMap = Record<string, () => void>;

export interface UseHotkeysOptions {
  enabled?: boolean;
  ignoreInputs?: boolean;
}

/**
 * Tiny global hotkey hook — no deps.
 * Keys are matched via `e.key` lowercased. Supports single keys (\"/\", \"f\", \"Escape\", \" \", \"ArrowLeft\").
 * Handler is not called if focus is inside input/textarea/select/contenteditable when ignoreInputs=true.
 */
export function useHotkeys(map: HotkeyMap, opts: UseHotkeysOptions = {}) {
  const { enabled = true, ignoreInputs = true } = opts;
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      if (ignoreInputs) {
        const t = e.target as HTMLElement | null;
        if (
          t &&
          (t instanceof HTMLInputElement ||
            t instanceof HTMLTextAreaElement ||
            t instanceof HTMLSelectElement ||
            t.isContentEditable)
        ) {
          // Allow Escape to bubble even inside inputs
          if (e.key !== "Escape") return;
        }
      }
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      // also try original case for special keys like \" \" (Space)
      const fn =
        mapRef.current[key] ?? mapRef.current[e.key] ?? mapRef.current[e.key.toLowerCase()];
      if (fn) {
        // avoid interfering with typing in inputs for single-char keys already filtered
        e.preventDefault();
        fn();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, ignoreInputs]);
}
