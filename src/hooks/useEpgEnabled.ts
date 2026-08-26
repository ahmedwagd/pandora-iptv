import { useCallback, useEffect, useState } from "react";
import { getValue, setValue } from "../lib/store";
import { StorageKeys } from "../lib/storageKeys";

const DEFAULT_ENABLED = true;

/** Persisted preference for whether the EPG guide is fetched/displayed. */
export function useEpgEnabled() {
  const [enabled, setEnabledState] = useState<boolean>(DEFAULT_ENABLED);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await getValue<boolean>(StorageKeys.epgEnabled);
      if (!cancelled && typeof saved === "boolean") setEnabledState(saved);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    void setValue(StorageKeys.epgEnabled, next);
  }, []);

  return { enabled, setEnabled };
}