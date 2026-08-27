import { useEffect } from "react";
import { useAppStore } from "../stores/appStore";
import type { ContentMode } from "../types";

/**
 * 0.8 Persist filters — cat+search+smartFilter per contentMode/profile
 * Persists browse filters (smartFilter/category/search) per profile+contentMode
 * to plugin-store + localStorage. Use in App.tsx.
 */
export function useBrowseFiltersPersistence(
  profileId: string | null,
  contentMode: ContentMode,
  ready: boolean
) {
  const hydrate = useAppStore((s) => s.hydrateBrowseFilters);
  const persist = useAppStore((s) => s.persistBrowseFilters);
  const smartFilter = useAppStore((s) => s.smartFilter);
  const category = useAppStore((s) => s.category);
  const search = useAppStore((s) => s.search);

  useEffect(() => {
    if (!ready || !profileId) return;
    if (contentMode === "live") return;
    void hydrate(profileId, contentMode);
  }, [ready, profileId, contentMode, hydrate]);

  useEffect(() => {
    if (!profileId) return;
    if (contentMode === "live") return;
    persist(profileId, contentMode);
  }, [profileId, contentMode, smartFilter, category, search, persist]);
}
