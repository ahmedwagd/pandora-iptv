import { useCallback, useEffect, useRef, useState } from "react";
import { notifyUpdateAvailable } from "../lib/updaterNotify";
import { useUpdaterPrefs, DEFAULT_INTERVAL_MS } from "./useUpdaterPrefs";
import { useLang } from "./useLang";
import { strings } from "../i18n";

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

  const check = useCallback(
    async (withNotify = notifyRef.current) => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      setChecking(true);
      setError(null);
      // Web preview / non-Tauri: simulate checking with visible spinner but do not pollute persisted lastChecked
      if (!isTauri()) {
        await new Promise((r) => setTimeout(r, 900));
        setInfo((prev) => prev ?? { available: false, currentVersion: "0.2.1" });
        setChecking(false);
        checkingRef.current = false;
        return;
      }
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
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
          const dismissed = dismissedRef.current;
          const shouldNotify = withNotify && dismissed !== next.latestVersion;
          if (shouldNotify) {
            void notifyUpdateAvailable(next, langRef.current);
          }
        } else if (update) {
          setInfo({ available: false, currentVersion: update.currentVersion });
        } else {
          // No update: `check()` returned null (Tauri v2 semantics: null means up-to-date).
          // Preserve known currentVersion or fallback to manifest version.
          setInfo((prev) => ({ available: false, currentVersion: prev?.currentVersion ?? "0.2.1" }));
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
    if (!isTauri()) {
      setError(null);
      setDownloading(true);
      setProgress(0);
      setNeedsRestart(false);
      for (let p = 10; p <= 100; p += 10) {
        await new Promise((r) => setTimeout(r, 90));
        setProgress(p);
        if (p === 100) setNeedsRestart(true);
      }
      setDownloading(false);
      return;
    }
    setError(null);
    setDownloading(true);
    setProgress(0);
    setNeedsRestart(false);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
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
              setProgress(pct);
            } else {
              // indeterminate — bump by chunk heuristic
              setProgress((prev) => {
                const p = prev ?? 0;
                return Math.min(95, p + 1);
              });
            }
          } else if (e.event === "Finished") {
            setProgress(100);
            setNeedsRestart(true);
          }
        } catch {
          // ignore progress parse errors
        }
      });
      // According to Tauri v2 docs, downloadAndInstall will have staged the update;
      // relaunch must be called explicitly via plugin-process.
      setProgress(100);
      setNeedsRestart(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || stringsRef.current.downloadFailed);
      setProgress(null);
    } finally {
      setDownloading(false);
    }
  }, [downloading]);

  const restart = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || stringsRef.current.restartFailed);
    }
  }, []);

  const dismiss = useCallback(() => {
    const v = info?.latestVersion ?? null;
    if (v) prefs.setDismissedVersion(v);
  }, [info?.latestVersion, prefs]);

  const clearDismiss = useCallback(() => {
    prefs.setDismissedVersion(null);
  }, [prefs]);

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
