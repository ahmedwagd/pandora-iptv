import { useCallback, useEffect, useState } from "react";
import { load, Store } from "@tauri-apps/plugin-store";
import type { Channel } from "../types";

const STORE_FILE = "iptv-app-data.json";
const FAVORITES_KEY = "favoriteIds";

let storePromise: Promise<Store> | null = null;
function getStore() {
  if (!storePromise) storePromise = load(STORE_FILE, { autoSave: true });
  return storePromise;
}

/**
 * Persists favorite channel ids to disk via Tauri's store plugin.
 * Deliberately not localStorage: Tauri webviews reset localStorage
 * more aggressively across some platforms, and a JSON file on disk
 * is easier for the user to find/back up.
 */
export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const store = await getStore();
      const saved = (await store.get<string[]>(FAVORITES_KEY)) ?? [];
      setFavoriteIds(new Set(saved));
      setReady(true);
    })();
  }, []);

  const toggleFavorite = useCallback((channel: Channel) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(channel.id)) next.delete(channel.id);
      else next.add(channel.id);

      getStore().then((store) => {
        store.set(FAVORITES_KEY, Array.from(next));
      });

      return next;
    });
  }, []);

  return { favoriteIds, toggleFavorite, ready };
}
