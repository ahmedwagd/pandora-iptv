import { useCallback, useEffect, useState } from "react";
import { getValue, setValue } from "../lib/store";
import { scopedKey, StorageKeys } from "../lib/storageKeys";
import type { WatchItem } from "../types";

const MAX_ITEMS = 50;

/** Redact credentials from Xtream URLs before persisting to disk */
function redactUrl(url: string): string {
  try {
    return url.replace(/\/(live|movie|series)\/[^/]+\/[^/]+\//, "/$1/***\/***/");
  } catch {
    return url;
  }
}

/**
 * Tracks recently-watched items (movies / episodes / channels) for the
 * "Continue watching" rail. Newest first, capped at MAX_ITEMS.
 * When profileId is provided, data is scoped to that profile.
 */
export function useWatchHistory(profileId: string | null = null) {
  const [history, setHistory] = useState<WatchItem[]>([]);
  const key = profileId ? scopedKey(StorageKeys.watchHistory, profileId) : StorageKeys.watchHistory;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = (await getValue<WatchItem[]>(key)) ?? [];
      if (!cancelled) setHistory(saved);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  const record = useCallback(
    (item: Omit<WatchItem, "watchedAt">) => {
      setHistory((prev) => {
        const next = [{ ...item, watchedAt: Date.now() }, ...prev.filter((i) => i.id !== item.id)].slice(0, MAX_ITEMS);
        const redacted = next.map((i) => ({ ...i, url: redactUrl(i.url) }));
        void setValue(key, redacted);
        return next;
      });
    },
    [key]
  );

  const remove = useCallback(
    (id: string) => {
      setHistory((prev) => {
        const next = prev.filter((i) => i.id !== id);
        void setValue(key, next.map((i) => ({ ...i, url: redactUrl(i.url) })));
        return next;
      });
    },
    [key]
  );

  const clear = useCallback(() => {
    setHistory([]);
    void setValue(key, []);
  }, [key]);

  return { history, record, remove, clear };
}
