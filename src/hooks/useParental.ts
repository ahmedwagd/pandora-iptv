import { useCallback, useState } from "react";
const KEY = "panora:parental";
function load(): { pin: string | null; locked: string[] } {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (j) return j;
  } catch {}
  return { pin: null, locked: [] };
}
export function useParental() {
  const [state, setState] = useState(load);
  const setPin = useCallback(
    (pin: string | null) => {
      const next = { ...state, pin: pin || null };
      localStorage.setItem(KEY, JSON.stringify(next));
      setState(next);
    },
    [state]
  );
  const toggleLock = useCallback(
    (cat: string) => {
      const locked = state.locked.includes(cat)
        ? state.locked.filter((c) => c !== cat)
        : [...state.locked, cat];
      const next = { ...state, locked };
      localStorage.setItem(KEY, JSON.stringify(next));
      setState(next);
    },
    [state]
  );
  const isLocked = useCallback(
    (cat: string | null) => !!cat && state.locked.includes(cat),
    [state.locked]
  );
  return { pin: state.pin, locked: state.locked, setPin, toggleLock, isLocked } as const;
}
