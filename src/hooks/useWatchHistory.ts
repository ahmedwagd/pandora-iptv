import { useCallback, useEffect, useState } from "react";
import { getValue, setValue } from "../lib/store";
import { StorageKeys } from "../lib/storageKeys";
import type { WatchItem } from "../types";

const MAX_ITEMS = 50;

/** Redact credentials from Xtream URLs before persisting to disk */
function redactUrl(url: string): string {
  try {
    // Xtream URLs embed credentials as /live/user/pass/ or /movie/user/pass/
    // Replace the credential segments with placeholder to avoid plaintext leak.
    return url.replace(/\/(live|movie|series)\/[^/]+\/[^/]+\//, "/$1/***\/***/");
  } catch {
    return url;
  }
}

/**
 * Tracks recently-watched items (movies / episodes / channels) for the
 * "Continue watching" rail. Newest first, capped at MAX_ITEMS.
 */
export function useWatchHistory() {
  const [history, setHistory] = useState<WatchItem[]>([]);

  useEffect(() => {
    (async () => {
      const saved = (await getValue<WatchItem[]>(StorageKeys.watchHistory)) ?? [];
      setHistory(saved);
    })();
  }, []);

  const record = useCallback((item: Omit<WatchItem, "watchedAt">) => {
    setHistory((prev) => {
      const next = [
        { ...item, watchedAt: Date.now() },
        ...prev.filter((i) => i.id !== item.id),
      ].slice(0, MAX_ITEMS);

      // Persist redacted copy: keep in-memory URL intact for playback,
      // but store redacted version to avoid leaking creds on disk.
      const redacted = next.map((i) => ({ ...i, url: redactUrl(i.url) }));
      setValue(StorageKeys.watchHistory, redacted);

      return next;
    });
  }, []);

  return { history, record };
}
