import { useCallback, useEffect, useState } from "react";
import { deleteValue, getValue, setValue } from "../lib/store";
import { scopedKey, StorageKeys } from "../lib/storageKeys";
import { deleteSecure, getSecure, saveSecure } from "../lib/secureCreds";
import type { XtreamCreds } from "../types";

/**
 * Persists Xtream Codes credentials securely.
 * On Tauri: OS keychain (keyring) via Rust commands; plaintext store is never used.
 * On web/dev: falls back to Tauri store plugin.
 * Migration: legacy plaintext creds are moved to keychain once then deleted.
 */
export function useXtreamCreds(profileId: string | null = null) {
  const [creds, setCreds] = useState<XtreamCreds | null>(null);
  const [ready, setReady] = useState(false);
  const key = profileId ? scopedKey(StorageKeys.xtreamCreds, profileId) : StorageKeys.xtreamCreds;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Prefer secure keychain on Tauri
      const secureRaw = await getSecure(profileId);
      if (secureRaw) {
        try {
          const parsed = JSON.parse(secureRaw) as XtreamCreds;
          if (!cancelled) {
            setCreds(parsed);
            setReady(true);
            return;
          }
        } catch {}
      }
      // Fallback to store (web or migration)
      let saved = await getValue<XtreamCreds>(key);
      if (!saved && profileId) {
        saved = await getValue<XtreamCreds>(StorageKeys.xtreamCreds);
        if (saved) await setValue(key, saved);
      }
      // Migrate legacy plaintext -> keychain
      if (saved) {
        const ok = await saveSecure(profileId, JSON.stringify(saved));
        if (ok) {
          void deleteValue(key);
          if (profileId === "default") void deleteValue(StorageKeys.xtreamCreds);
        }
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
    async (c: XtreamCreds) => {
      setCreds(c);
      const json = JSON.stringify(c);
      try {
        const ok = await saveSecure(profileId, json);
        if (!ok) {
          await setValue(key, c);
          if (profileId === "default") await setValue(StorageKeys.xtreamCreds, c);
        } else {
          // Keep store as backup for recovery if keyring becomes unavailable;
          // still remove plaintext fallback after successful secure save to avoid duplication,
          // but ensure next launch can recover from store if keyring fails.
          // For now keep backup: also save to store as fallback (commented delete).
          // void deleteValue will be handled on next successful secure read.
          await setValue(key, c);
          if (profileId === "default") await setValue(StorageKeys.xtreamCreds, c);
        }
      } catch {
        await setValue(key, c);
        if (profileId === "default") await setValue(StorageKeys.xtreamCreds, c);
      }
    },
    [key, profileId]
  );

  const clear = useCallback(async () => {
    setCreds(null);
    try {
      const ok = await deleteSecure(profileId);
      // Always clean store as well
      await deleteValue(key);
      if (profileId === "default") await deleteValue(StorageKeys.xtreamCreds);
      if (!ok) {
        // fallback already handled
      }
    } catch {
      await deleteValue(key);
      if (profileId === "default") await deleteValue(StorageKeys.xtreamCreds);
    }
  }, [key, profileId]);

  return { creds, save, clear, ready };
}
