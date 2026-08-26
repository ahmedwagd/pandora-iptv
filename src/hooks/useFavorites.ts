import { useCallback, useEffect, useState } from "react";
import { getValue, setValue } from "../lib/store";
import { StorageKeys } from "../lib/storageKeys";

/**
 * Persists favorite ids to disk via Tauri's store plugin.
 * Ids are namespaced by content type ("movie:123", "series:123",
 * "episode:123", or a raw live stream id) to avoid collisions.
 */
export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const saved = (await getValue<string[]>(StorageKeys.favoriteIds)) ?? [];
      setFavoriteIds(new Set(saved));
    })();
  }, []);

  const toggle = useCallback((id: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);

      setValue(StorageKeys.favoriteIds, Array.from(next));

      return next;
    });
  }, []);

  return { favoriteIds, toggle };
}
