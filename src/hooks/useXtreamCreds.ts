import { useCallback, useEffect, useState } from "react";
import { deleteValue, getValue, setValue } from "../lib/store";
import { scopedKey, StorageKeys } from "../lib/storageKeys";
import type { XtreamCreds } from "../types";

/**
 * Persists Xtream Codes credentials (server/username/password) to disk
 * via Tauri's store plugin when "Remember me" is checked.
 * When profileId is provided, data is scoped to that profile.
 */
export function useXtreamCreds(profileId: string | null = null) {
  const [creds, setCreds] = useState<XtreamCreds | null>(null);
  const [ready, setReady] = useState(false);
  const key = profileId ? scopedKey(StorageKeys.xtreamCreds, profileId) : StorageKeys.xtreamCreds;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // try scoped key first, fallback to legacy global key for migration
      let saved = await getValue<XtreamCreds>(key);
      if (!saved && profileId) {
        saved = await getValue<XtreamCreds>(StorageKeys.xtreamCreds);
        if (saved) await setValue(key, saved);
      }
      if (!cancelled) {
        if (saved) setCreds(saved);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, profileId]);

  const save = useCallback(
    (c: XtreamCreds) => {
      setCreds(c);
      void setValue(key, c);
      // also keep legacy key in sync for default profile
      if (profileId === "default") void setValue(StorageKeys.xtreamCreds, c);
    },
    [key, profileId]
  );

  const clear = useCallback(() => {
    setCreds(null);
    void deleteValue(key);
    if (profileId === "default") void deleteValue(StorageKeys.xtreamCreds);
  }, [key, profileId]);

  return { creds, save, clear, ready };
}
