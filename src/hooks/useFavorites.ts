import { useCallback, useEffect, useState } from "react";
import { load, Store } from "@tauri-apps/plugin-store";

const STORE_FILE = "iptv-app-data.json";
const FAVORITES_KEY = "favoriteIds";

let storePromise: Promise<Store> | null = null;
function getStore() {
  if (!storePromise) storePromise = load(STORE_FILE, { autoSave: true });
  return storePromise;
}

/**
 * Persists favorite ids to disk via Tauri's store plugin.
 * Ids are namespaced by content type ("movie:123", "series:123",
 * "episode:123", or a raw live stream id) to avoid collisions.
 */
export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const store = await getStore();
      const saved = (await store.get<string[]>(FAVORITES_KEY)) ?? [];
      setFavoriteIds(new Set(saved));
    })();
  }, []);

  const toggle = useCallback((id: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);

      getStore().then((store) => {
        store.set(FAVORITES_KEY, Array.from(next));
      });

      return next;
    });
  }, []);

  return { favoriteIds, toggle };
}
