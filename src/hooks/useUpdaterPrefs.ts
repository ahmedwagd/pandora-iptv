import { useCallback, useEffect, useState } from "react";
import { deleteValue, getValue, setValue } from "../lib/store";
import { StorageKeys } from "../lib/storageKeys";

export const DEFAULT_AUTO_CHECK = true;
export const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

export function useUpdaterPrefs() {
  const [autoCheckEnabled, setAutoCheckEnabledState] = useState<boolean>(DEFAULT_AUTO_CHECK);
  const [intervalMs, setIntervalMsState] = useState<number>(DEFAULT_INTERVAL_MS);
  const [lastChecked, setLastCheckedState] = useState<number | null>(null);
  const [dismissedVersion, setDismissedVersionState] = useState<string | null>(null);
  const [stagedVersion, setStagedVersionState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [savedAuto, savedInterval, savedLast, savedDismissed, savedStaged] = await Promise.all([
          getValue<boolean>(StorageKeys.updaterAutoCheck),
          getValue<number>(StorageKeys.updaterIntervalMs),
          getValue<number>(StorageKeys.updaterLastChecked),
          getValue<string>(StorageKeys.updaterDismissedVersion),
          getValue<string>(StorageKeys.updaterStagedVersion),
        ]);
        if (cancelled) return;
        if (typeof savedAuto === "boolean") setAutoCheckEnabledState(savedAuto);
        if (typeof savedInterval === "number" && savedInterval > 0) setIntervalMsState(savedInterval);
        if (typeof savedLast === "number") setLastCheckedState(savedLast);
        if (typeof savedDismissed === "string") setDismissedVersionState(savedDismissed);
        if (typeof savedStaged === "string") setStagedVersionState(savedStaged);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setAutoCheckEnabled = useCallback((next: boolean) => {
    setAutoCheckEnabledState(next);
    void setValue(StorageKeys.updaterAutoCheck, next);
  }, []);

  const setIntervalMs = useCallback((next: number) => {
    setIntervalMsState(next);
    void setValue(StorageKeys.updaterIntervalMs, next);
  }, []);

  const setLastChecked = useCallback((ts: number | null) => {
    setLastCheckedState(ts);
    if (ts === null) {
      // keep last value? just store null
      void setValue(StorageKeys.updaterLastChecked, ts);
    } else {
      void setValue(StorageKeys.updaterLastChecked, ts);
    }
  }, []);

  const setDismissedVersion = useCallback((v: string | null) => {
    setDismissedVersionState(v);
    if (v === null) void deleteValue(StorageKeys.updaterDismissedVersion);
    else void setValue(StorageKeys.updaterDismissedVersion, v);
  }, []);

  const setStagedVersion = useCallback((v: string | null) => {
    setStagedVersionState(v);
    if (v === null) void deleteValue(StorageKeys.updaterStagedVersion);
    else void setValue(StorageKeys.updaterStagedVersion, v);
  }, []);

  const clearStagedVersion = useCallback(() => {
    setStagedVersionState(null);
    void deleteValue(StorageKeys.updaterStagedVersion);
  }, []);

  return {
    autoCheckEnabled,
    setAutoCheckEnabled,
    intervalMs,
    setIntervalMs,
    lastChecked,
    setLastChecked,
    dismissedVersion,
    setDismissedVersion,
    stagedVersion,
    setStagedVersion,
    clearStagedVersion,
    ready,
  };
}
