import { useCallback, useEffect, useState } from "react";
import { getValue, setValue } from "../lib/store";
import { scopedKey, StorageKeys } from "../lib/storageKeys";

const MAX_RECENT = 8;

export function useRecentSearches(profileId: string | null = null) {
  const key = profileId ? scopedKey(StorageKeys.recentSearches, profileId) : StorageKeys.recentSearches;
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = (await getValue<string[]>(key)) ?? [];
      if (!cancelled) setRecent(saved.slice(0, MAX_RECENT));
    })();
    return () => { cancelled = true; };
  }, [key]);

  const push = useCallback((term: string) => {
    const t = term.trim();
    if (!t) return;
    setRecent((prev) => {
      const next = [t, ...prev.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT);
      void setValue(key, next);
      return next;
    });
  }, [key]);

  const clear = useCallback(() => {
    setRecent([]);
    void setValue(key, []);
  }, [key]);

  return { recent, push, clear };
}
