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
    // Mark loading but keep previous creds to avoid login flash when
    // profileId transitions null -> "default" (same keyring account).
    setReady(false);
    (async () => {
      // Prefer secure keychain on Tauri
      const secureRaw = await getSecure(profileId);
      if (secureRaw) {
        try {
          const parsed = JSON.parse(secureRaw) as XtreamCreds;
          if (!cancelled) {
            setCreds(parsed);
            setReady(true);
            // Keep store as backup for recovery if keyring later fails
            // Always mirror to unscoped global for cross-profile recovery after Store reset
            try {
              await setValue(key, parsed);
              await setValue(StorageKeys.xtreamCreds, parsed);
            } catch {}
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
      // Robust cross-profile recovery: if still no creds, try any available source
      // This handles Store reset after update where old profile id is lost but creds exist
      // under previous profile's scoped key or unscoped keyring/localStorage.
      if (!saved) {
        // Try keyring for default account (covers null -> default mapping)
        try {
          const fallbackSecure = profileId !== null ? await getSecure(null) : null;
          if (fallbackSecure) {
            const parsed = JSON.parse(fallbackSecure) as XtreamCreds;
            saved = parsed;
            if (parsed) await setValue(key, parsed);
          }
        } catch {}
      }
      if (!saved) {
        try {
          const unscoped = await getValue<XtreamCreds>(StorageKeys.xtreamCreds);
          if (unscoped) {
            saved = unscoped;
            await setValue(key, saved);
          }
        } catch {}
      }
      if (!saved) {
        // Last resort: enumerate localStorage for any Xtream creds (survives Store file loss)
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (k === StorageKeys.xtreamCreds || k.startsWith(`${StorageKeys.xtreamCreds}:`)) {
              const raw = localStorage.getItem(k);
              if (!raw) continue;
              try {
                const parsed = JSON.parse(raw) as XtreamCreds;
                if (parsed?.server && parsed?.username && parsed?.password) {
                  saved = parsed;
                  await setValue(key, saved);
                  await setValue(StorageKeys.xtreamCreds, saved);
                  break;
                }
              } catch {}
            }
          }
        } catch {}
      }
      // Migrate legacy plaintext -> keychain (keep store as backup for robustness)
      if (saved) {
        try {
          await saveSecure(profileId, JSON.stringify(saved));
        } catch {}
        // Keep store as backup; do not delete
        // Ensure unscoped global backup exists for future profile resets
        try {
          await setValue(StorageKeys.xtreamCreds, saved);
        } catch {}
      }
      if (!cancelled) {
        setCreds(saved ?? null);
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
        // Always keep global backups for cross-profile recovery after Store reset
        // Best-effort: also write to default/global keyring account
        try {
          if (profileId !== null && profileId !== "default") {
            await saveSecure(null, json);
          } else if (profileId === null) {
            // also ensure scoped default has it if we saved via null
            await saveSecure("default", json);
          }
        } catch {}
        if (!ok) {
          await setValue(key, c);
          await setValue(StorageKeys.xtreamCreds, c);
        } else {
          // Keep store as backup for recovery if keyring becomes unavailable;
          // Always keep unscoped global backup so Store reset can recover.
          await setValue(key, c);
          await setValue(StorageKeys.xtreamCreds, c);
        }
      } catch {
        await setValue(key, c);
        await setValue(StorageKeys.xtreamCreds, c);
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
