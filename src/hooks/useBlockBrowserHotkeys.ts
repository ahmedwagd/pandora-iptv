import { useEffect } from "react";

/**
 * Prevent browser chrome hotkeys that break the app experience
 * (reload, find, print, new tab, etc.) especially during fullscreen playback.
 * Allows text-editing shortcuts (Ctrl/Cmd+A/C/V/X/Z/Y).
 */
export function useBlockBrowserHotkeys(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const key = e.key;
      const lower = key.length === 1 ? key.toLowerCase() : key;

      // F-keys: F1 help, F3 find, F5 reload, F7 caret, F12 devtools
      if (
        key === "F1" ||
        key === "F3" ||
        key === "F5" ||
        key === "F7" ||
        key === "F12" ||
        key === "F11"
      ) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;

      if (isMod) {
        // allow copy/paste/select/undo/redo/cut
        if (["a", "c", "v", "x", "z", "y"].includes(lower)) return;

        // Ctrl/Cmd + Shift + I/J/C (devtools)
        if (e.shiftKey && ["i", "j", "c"].includes(lower)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // Ctrl/Cmd + R (reload), T (new tab), W (close), N (new window), P (print)
        // S (save), O (open), F (find), G (find next), H (history), J (downloads)
        // U (view source), D (bookmark), L (address), E (search), K (search), Q (quit)
        // B (bookmarks), +/-/0 (zoom)
        const blockedCtrl = new Set([
          "r",
          "t",
          "w",
          "n",
          "p",
          "s",
          "o",
          "f",
          "g",
          "h",
          "j",
          "u",
          "d",
          "l",
          "e",
          "k",
          "b",
          "q",
          "i",
          "+",
          "-",
          "=",
          "_",
          "0",
        ]);
        if (blockedCtrl.has(lower) || blockedCtrl.has(key)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // Numpad zoom keys
        if (
          key === "Add" ||
          key === "Subtract" ||
          key === "NumpadAdd" ||
          key === "NumpadSubtract"
        ) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      // Alt + arrows / Home (back/forward)
      if (e.altKey && (key === "ArrowLeft" || key === "ArrowRight" || key === "Home")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () =>
      window.removeEventListener("keydown", handler, {
        capture: true,
      } as unknown as EventListenerOptions);
  }, [enabled]);
}
