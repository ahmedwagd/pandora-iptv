import { useCallback, useEffect, useState } from "react";
import { getValue, setValue } from "../lib/store";
import { scopedKey, StorageKeys } from "../lib/storageKeys";

/**
 * Persists favorite ids to disk via Tauri's store plugin.
 * Ids are namespaced by content type ("movie:123", "series:123",
 * "episode:123", or a raw live stream id) to avoid collisions.
 * When profileId is provided, data is scoped to that profile.
 */
export function useFavorites(profileId: string | null = null) {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const key = profileId ? scopedKey(StorageKeys.favoriteIds, profileId) : StorageKeys.favoriteIds;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = (await getValue<string[]>(key)) ?? [];
      if (!cancelled) setFavoriteIds(new Set(saved));
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  const toggle = useCallback(
    (id: string) => {
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        void setValue(key, Array.from(next));
        return next;
      });
    },
    [key]
  );

  return { favoriteIds, toggle };
}
