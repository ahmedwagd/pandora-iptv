import { useCallback, useEffect, useState } from "react";
import { deleteValue, getValue, setValue } from "../lib/store";
import { scopedKey, StorageKeys } from "../lib/storageKeys";
import type { Profile } from "../types/profile";
import type { WatchItem } from "../types";
import type { XtreamCreds } from "../types";

const DEFAULT_ID = "default";

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const savedProfiles = await getValue<Profile[]>(StorageKeys.profiles);
      const savedActive = await getValue<string>(StorageKeys.activeProfileId);

      if (!savedProfiles || savedProfiles.length === 0) {
        // migration: check legacy data
        const legacyCreds = await getValue<XtreamCreds>(StorageKeys.xtreamCreds);
        const legacyFavs = await getValue<string[]>(StorageKeys.favoriteIds);
        const legacyHistory = await getValue<WatchItem[]>(StorageKeys.watchHistory);

        const def: Profile = { id: DEFAULT_ID, name: "Default", createdAt: Date.now() };
        const nextProfiles = [def];
        await setValue(StorageKeys.profiles, nextProfiles);
        await setValue(StorageKeys.activeProfileId, def.id);

        // copy legacy data into default profile namespace (keep legacy keys for fallback)
        if (legacyCreds) await setValue(scopedKey(StorageKeys.xtreamCreds, def.id), legacyCreds);
        if (legacyFavs) await setValue(scopedKey(StorageKeys.favoriteIds, def.id), legacyFavs);
        if (legacyHistory) await setValue(scopedKey(StorageKeys.watchHistory, def.id), legacyHistory);

        setProfiles(nextProfiles);
        setActiveId(def.id);
      } else {
        setProfiles(savedProfiles);
        const active = savedActive && savedProfiles.some((p) => p.id === savedActive) ? savedActive : savedProfiles[0].id;
        if (active !== savedActive) await setValue(StorageKeys.activeProfileId, active);
        setActiveId(active);
      }
      setReady(true);
    })();
  }, []);

  const create = useCallback(
    async (name: string) => {
      const trimmed = name.trim() || `Profile ${profiles.length + 1}`;
      const p: Profile = { id: uid(), name: trimmed, createdAt: Date.now() };
      const next = [...profiles, p];
      setProfiles(next);
      setActiveId(p.id);
      await setValue(StorageKeys.profiles, next);
      await setValue(StorageKeys.activeProfileId, p.id);
      return p;
    },
    [profiles]
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      const next = profiles.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p));
      setProfiles(next);
      await setValue(StorageKeys.profiles, next);
    },
    [profiles]
  );

  const remove = useCallback(
    async (id: string) => {
      if (profiles.length <= 1) return;
      const next = profiles.filter((p) => p.id !== id);
      setProfiles(next);
      await setValue(StorageKeys.profiles, next);
      // also clean scoped data
      await deleteValue(scopedKey(StorageKeys.xtreamCreds, id));
      await deleteValue(scopedKey(StorageKeys.favoriteIds, id));
      await deleteValue(scopedKey(StorageKeys.watchHistory, id));
      if (activeId === id) {
        const fallback = next[0].id;
        setActiveId(fallback);
        await setValue(StorageKeys.activeProfileId, fallback);
      }
    },
    [profiles, activeId]
  );

  const switchTo = useCallback(async (id: string) => {
    if (!profiles.some((p) => p.id === id)) return;
    setActiveId(id);
    await setValue(StorageKeys.activeProfileId, id);
  }, [profiles]);

  const active = profiles.find((p) => p.id === activeId) ?? null;

  return { profiles, activeId, active, ready, create, rename, remove, switchTo };
}
