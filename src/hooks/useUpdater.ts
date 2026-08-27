import { useCallback, useEffect, useRef, useState } from "react";
import { notifyUpdateAvailable } from "../lib/updaterNotify";
import { useUpdaterPrefs, DEFAULT_INTERVAL_MS } from "./useUpdaterPrefs";
import { useLang } from "./useLang";
import { strings } from "../i18n";
import { getStore } from "../lib/store";

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  body?: string;
}

export interface UseUpdaterOptions {
  notify?: boolean;
  autoCheck?: boolean;
  intervalMs?: number;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
}

type TauriUpdate = {
  rid?: number;
  available: boolean;
  currentVersion: string;
  version: string;
  body?: string | null;
  downloadAndInstall: (cb: (e: unknown) => void) => Promise<void>;
  close?: () => Promise<void>;
};

const UPDATE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MANIFEST_FALLBACK_VERSION = "0.2.1";

function classifyDownloadErrorI18n(msg: string, s: Record<string, string>): string {
  const low = msg.toLowerCase();
  if (low.includes("signature") || low.includes("verification")) {
    return s.signatureFailed + (msg ? `: ${msg}` : "");
  }
  if (low.includes("space") || low.includes("disk") || low.includes("insufficient")) {
    return s.diskSpaceError + (msg ? `: ${msg}` : "");
  }
  if (
    low.includes("network") ||
    low.includes("fetch") ||
    low.includes("timeout") ||
    low.includes("http") ||
    low.includes("connection") ||
    low.includes("offline") ||
    low.includes("failed to fetch")
  ) {
    return s.networkError + (msg ? `: ${msg}` : "");
  }
  return msg || s.downloadFailed;
}

export function useUpdater(opts: UseUpdaterOptions = {}) {
  const { notify = false, intervalMs } = opts;
  const prefs = useUpdaterPrefs();
  const effectiveInterval = intervalMs ?? prefs.intervalMs ?? DEFAULT_INTERVAL_MS;
  const effectiveAutoCheck = typeof opts.autoCheck === "boolean" ? opts.autoCheck : prefs.autoCheckEnabled;
  const { lang } = useLang();
  const s = strings[lang];

  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsRestart, setNeedsRestart] = useState(false);

  const checkingRef = useRef(false);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const dismissedRef = useRef<string | null>(null);
  const setLastCheckedRef = useRef(prefs.setLastChecked);
  const langRef = useRef(lang);
  const stringsRef = useRef(s);
  const stagedVersionRef = useRef<string | null>(prefs.stagedVersion ?? null);
  const clearStagedRef = useRef(prefs.clearStagedVersion);
  const setStagedRef = useRef(prefs.setStagedVersion);
  // cache for Update object
  const updateRef = useRef<TauriUpdate | null>(null);
  const updateCachedAtRef = useRef<number>(0);
  const lastProgressUpdateRef = useRef<number>(0);
  const pendingProgressRef = useRef<number | null>(null);
  const progressRafRef = useRef<number | null>(null);

  // keep refs in sync
  useEffect(() => {
    dismissedRef.current = prefs.dismissedVersion;
  }, [prefs.dismissedVersion]);
  useEffect(() => {
    setLastCheckedRef.current = prefs.setLastChecked;
  }, [prefs.setLastChecked]);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);
  useEffect(() => {
    stringsRef.current = s;
  }, [s]);
  useEffect(() => {
    stagedVersionRef.current = prefs.stagedVersion ?? null;
  }, [prefs.stagedVersion]);
  useEffect(() => {
    clearStagedRef.current = prefs.clearStagedVersion;
  }, [prefs.clearStagedVersion]);
  useEffect(() => {
    setStagedRef.current = prefs.setStagedVersion;
  }, [prefs.setStagedVersion]);

  // Restore staged state on boot if persistence exists
  useEffect(() => {
    if (!prefs.ready) return;
    if (prefs.stagedVersion) {
      // If we have a staged version persisted, assume needsRestart until proven otherwise.
      // Will be cleared by check() when no update is found after restart.
      setNeedsRestart(true);
      // Ensure info reflects staged available if not yet loaded
      setInfo((prev) => {
        if (prev?.available && prev.latestVersion === prefs.stagedVersion) return prev;
        if (prev) return prev;
        return { available: true, currentVersion: MANIFEST_FALLBACK_VERSION, latestVersion: prefs.stagedVersion!, body: undefined };
      });
    }
  }, [prefs.ready, prefs.stagedVersion]);

  // Keep needsRestart in sync with stagedVersion + info
  useEffect(() => {
    if (prefs.stagedVersion && info?.available && info.latestVersion === prefs.stagedVersion) {
      setNeedsRestart(true);
    } else if (!prefs.stagedVersion && !downloading) {
      // staged cleared externally -> reset if not currently downloading
      // but keep true if just finished install in this session
      // we only auto-clear when stagedVersion becomes null and no staged in ref?
      // Do not force false here if user just staged in this session before persistence sync
      if (stagedVersionRef.current === null && needsRestart && !info?.available) {
        // if check cleared staged and no update available, reset
        setNeedsRestart(false);
      }
    }
  }, [prefs.stagedVersion, info?.available, info?.latestVersion, downloading, needsRestart]);

  const throttledSetProgress = useCallback((pct: number) => {
    const now = Date.now();
    // Always allow 100 to go through immediately
    if (pct >= 100) {
      if (progressRafRef.current !== null && typeof window !== "undefined" && window.cancelAnimationFrame) {
        window.cancelAnimationFrame(progressRafRef.current);
        progressRafRef.current = null;
      }
      pendingProgressRef.current = null;
      lastProgressUpdateRef.current = now;
      setProgress(100);
      return;
    }
    // Throttle ~100ms
    if (now - lastProgressUpdateRef.current < 100) {
      pendingProgressRef.current = pct;
      if (progressRafRef.current === null && typeof window !== "undefined" && window.requestAnimationFrame) {
        progressRafRef.current = window.requestAnimationFrame(() => {
          progressRafRef.current = null;
          if (pendingProgressRef.current !== null) {
            lastProgressUpdateRef.current = Date.now();
            setProgress(pendingProgressRef.current);
            pendingProgressRef.current = null;
          }
        });
      } else if (progressRafRef.current === null) {
        // fallback for non-browser (tests)
        window.setTimeout(() => {
          progressRafRef.current = null;
          if (pendingProgressRef.current !== null) {
            lastProgressUpdateRef.current = Date.now();
            setProgress(pendingProgressRef.current);
            pendingProgressRef.current = null;
          }
        }, 100);
      }
      return;
    }
    lastProgressUpdateRef.current = now;
    setProgress(pct);
  }, []);

  const check = useCallback(
    async (withNotify = notifyRef.current) => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      setChecking(true);
      setError(null);
      // Web preview / non-Tauri: simulate checking with visible spinner but do not pollute persisted lastChecked
      if (!isTauri()) {
        await new Promise((r) => setTimeout(r, 900));
        setInfo((prev) => prev ?? { available: false, currentVersion: MANIFEST_FALLBACK_VERSION });
        setChecking(false);
        checkingRef.current = false;
        return;
      }
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = (await check()) as TauriUpdate | null;
        const now = Date.now();
        setLastCheckedRef.current(now);
        if (update?.available) {
          const next: UpdateInfo = {
            available: true,
            currentVersion: update.currentVersion,
            latestVersion: update.version,
            body: update.body ?? undefined,
          };
          setInfo(next);
          // cache Update object for install() reuse
          updateRef.current = update;
          updateCachedAtRef.current = now;
          // If staged version differs from latest, keep needsRestart if staged still pending
          // else if staged matches latest, keep needsRestart true
          if (stagedVersionRef.current && stagedVersionRef.current === next.latestVersion) {
            setNeedsRestart(true);
          }
          const dismissed = dismissedRef.current;
          const shouldNotify = withNotify && dismissed !== next.latestVersion;
          if (shouldNotify) {
            void notifyUpdateAvailable(next, langRef.current);
          }
        } else if (update) {
          setInfo({ available: false, currentVersion: update.currentVersion });
          // No update but update object exists (edge case) – clear cache
          updateRef.current = null;
          updateCachedAtRef.current = 0;
          // Purge staged if we are now up-to-date and staged was previous version
          if (stagedVersionRef.current) {
            // If we have staged but check says no update, assume installed
            // Clear after successful check
            clearStagedRef.current();
            setNeedsRestart(false);
          }
        } else {
          // No update: `check()` returned null (Tauri v2 semantics: null means up-to-date).
          // Preserve known currentVersion or fallback to manifest version.
          setInfo((prev) => ({ available: false, currentVersion: prev?.currentVersion ?? MANIFEST_FALLBACK_VERSION }));
          updateRef.current = null;
          updateCachedAtRef.current = 0;
          if (stagedVersionRef.current) {
            // Staged exists but no update available anymore – likely just updated and restarted
            // Clear staged state
            clearStagedRef.current();
            setNeedsRestart(false);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // "unconfigured" is expected in dev builds without updater artifacts; hide to avoid noise,
        // but still log for debugging. Any other error surfaces to the user.
        if (msg && msg.toLowerCase().includes("unconfigured")) {
          console.warn("[updater] check skipped (unconfigured):", msg);
        } else if (msg) {
          setError(msg);
        }
      } finally {
        setChecking(false);
        checkingRef.current = false;
      }
    },
    []
  );

  const install = useCallback(async () => {
    if (checkingRef.current || downloading) return;
    if (needsRestart) return; // already staged, require restart
    if (!isTauri()) {
      setError(null);
      setDownloading(true);
      setProgress(0);
      setNeedsRestart(false);
      lastProgressUpdateRef.current = 0;
      for (let p = 10; p <= 100; p += 10) {
        await new Promise((r) => setTimeout(r, 90));
        throttledSetProgress(p);
        if (p === 100) {
          setNeedsRestart(true);
          // simulate persistence for preview
          setStagedRef.current(info?.latestVersion ?? MANIFEST_FALLBACK_VERSION);
        }
      }
      setDownloading(false);
      return;
    }
    setError(null);
    setDownloading(true);
    setProgress(0);
    setNeedsRestart(false);
    lastProgressUpdateRef.current = 0;
    pendingProgressRef.current = null;
    try {
      let update: TauriUpdate | null = null;
      const nowTs = Date.now();
      const cached = updateRef.current;
      const cachedAge = nowTs - (updateCachedAtRef.current || 0);
      const canReuse =
        cached !== null &&
        cached.version === info?.latestVersion &&
        info?.available === true &&
        cachedAge < UPDATE_CACHE_TTL_MS;

      if (canReuse) {
        update = cached;
      } else {
        const { check } = await import("@tauri-apps/plugin-updater");
        const fresh = (await check()) as TauriUpdate | null;
        if (fresh?.available) {
          update = fresh;
          updateRef.current = fresh;
          updateCachedAtRef.current = nowTs;
          // update info to reflect fresh check
          const next: UpdateInfo = {
            available: true,
            currentVersion: fresh.currentVersion,
            latestVersion: fresh.version,
            body: fresh.body ?? undefined,
          };
          setInfo(next);
          setLastCheckedRef.current(nowTs);
        } else {
          update = fresh;
          updateRef.current = null;
          updateCachedAtRef.current = 0;
        }
      }

      if (!update?.available) {
        setError(stringsRef.current.noUpdateAvailable);
        setDownloading(false);
        setProgress(null);
        return;
      }
      let downloaded = 0;
      let total = 0;
      // downloadAndInstall with progress callback (Tauri v2)
      await update.downloadAndInstall((event: unknown) => {
        try {
          const e = event as { event: string; data?: Record<string, number> };
          if (e.event === "Started" && e.data) {
            total = (e.data.contentLength as number) ?? 0;
          } else if (e.event === "Progress" && e.data) {
            const chunk = (e.data.chunkLength as number) ?? 0;
            downloaded += chunk;
            if (total > 0) {
              const pct = Math.min(100, Math.round((downloaded / total) * 100));
              throttledSetProgress(pct);
            } else {
              // indeterminate — bump by chunk heuristic, throttled
              const heuristic = pendingProgressRef.current ?? 0;
              const nextPct = Math.min(95, heuristic + 1);
              throttledSetProgress(nextPct);
            }
          } else if (e.event === "Finished") {
            throttledSetProgress(100);
            setNeedsRestart(true);
            // persist staged version immediately on Finished
            try {
              setStagedRef.current(update!.version);
            } catch {
              // ignore persistence errors
            }
          }
        } catch {
          // ignore progress parse errors
        }
      });
      // According to Tauri v2 docs, downloadAndInstall will have staged the update;
      // relaunch must be called explicitly via plugin-process.
      // Defensive: ensure staged state even if Finished event not fired
      throttledSetProgress(100);
      setNeedsRestart(true);
      try {
        setStagedRef.current(update.version);
      } catch {
        // ignore
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const localized = classifyDownloadErrorI18n(msg, stringsRef.current as unknown as Record<string, string>);
      setError(localized || stringsRef.current.downloadFailed);
      setProgress(null);
    } finally {
      setDownloading(false);
    }
  }, [downloading, needsRestart, info?.latestVersion, info?.available, throttledSetProgress]);

  const restart = useCallback(async () => {
    if (!isTauri()) return;
    // Guard: only restart if staged
    if (!needsRestart && !stagedVersionRef.current) {
      setError(stringsRef.current.noUpdateAvailable);
      return;
    }
    try {
      // Flush store to avoid losing preferences on abrupt exit
      try {
        const store = await getStore();
        // Store class has save() method via plugin-store
        const maybeSave = store as unknown as { save?: () => Promise<void> };
        if (maybeSave.save) await maybeSave.save();
      } catch {
        // ignore flush errors – still attempt relaunch
      }
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || stringsRef.current.restartFailed);
      // keep needsRestart true for retry
    }
  }, [needsRestart]);

  const dismiss = useCallback(() => {
    const v = info?.latestVersion ?? null;
    if (v) prefs.setDismissedVersion(v);
    // Dismiss only hides banner; do NOT clear stagedVersion – keeps restart available via Settings
  }, [info?.latestVersion, prefs.setDismissedVersion]);

  const clearDismiss = useCallback(() => {
    prefs.setDismissedVersion(null);
  }, [prefs.setDismissedVersion]);

  // Initial check on mount if autoCheck enabled and prefs ready
  useEffect(() => {
    if (!prefs.ready) return;
    if (!effectiveAutoCheck) return;
    // small delay to avoid blocking initial render
    const t = window.setTimeout(() => {
      void check(true);
    }, 1200);
    return () => window.clearTimeout(t);
    // only run once when prefs ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.ready, effectiveAutoCheck]);

  // Periodic interval
  useEffect(() => {
    if (!prefs.ready) return;
    if (!effectiveAutoCheck) return;
    if (!effectiveInterval || effectiveInterval <= 0) return;
    const id = window.setInterval(() => {
      void check(true);
    }, effectiveInterval);
    return () => window.clearInterval(id);
  }, [prefs.ready, effectiveAutoCheck, effectiveInterval, check]);

  const isDismissed = !!info?.available && !!info.latestVersion && prefs.dismissedVersion === info.latestVersion;

  return {
    info,
    checking,
    downloading,
    progress,
    error,
    lastChecked: prefs.lastChecked,
    needsRestart,
    isDismissed,
    dismissedVersion: prefs.dismissedVersion,
    stagedVersion: prefs.stagedVersion,
    autoCheckEnabled: prefs.autoCheckEnabled,
    setAutoCheckEnabled: prefs.setAutoCheckEnabled,
    intervalMs: effectiveInterval,
    setIntervalMs: prefs.setIntervalMs,
    check,
    install,
    restart,
    dismiss,
    clearDismiss,
  };
}

export type UpdaterState = ReturnType<typeof useUpdater>;
