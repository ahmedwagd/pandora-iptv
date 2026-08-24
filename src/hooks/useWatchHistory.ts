import { useCallback, useEffect, useState } from "react";
import { load, Store } from "@tauri-apps/plugin-store";
import type { WatchItem } from "../types";

const STORE_FILE = "iptv-app-data.json";
const WATCH_KEY = "watchHistory";
const MAX_ITEMS = 50;

let storePromise: Promise<Store> | null = null;
function getStore() {
  if (!storePromise) storePromise = load(STORE_FILE, { autoSave: true });
  return storePromise;
}

/**
 * Tracks recently-watched items (movies / episodes / channels) for the
 * "Continue watching" rail. Newest first, capped at MAX_ITEMS.
 */
export function useWatchHistory() {
  const [history, setHistory] = useState<WatchItem[]>([]);

  useEffect(() => {
    (async () => {
      const store = await getStore();
      const saved = (await store.get<WatchItem[]>(WATCH_KEY)) ?? [];
      setHistory(saved);
    })();
  }, []);

  const record = useCallback((item: Omit<WatchItem, "watchedAt">) => {
    setHistory((prev) => {
      const next = [
        { ...item, watchedAt: Date.now() },
        ...prev.filter((i) => i.id !== item.id),
      ].slice(0, MAX_ITEMS);

      getStore().then((store) => {
        store.set(WATCH_KEY, next);
      });

      return next;
    });
  }, []);

  return { history, record };
}
