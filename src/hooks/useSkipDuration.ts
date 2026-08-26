import { useCallback, useEffect, useState } from "react";
import { getValue, setValue } from "../lib/store";
import { StorageKeys } from "../lib/storageKeys";

const DEFAULT_SKIP = 10;
const MIN_SKIP = 5;
const MAX_SKIP = 60;

function clamp(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SKIP;
  return Math.max(MIN_SKIP, Math.min(MAX_SKIP, Math.round(n)));
}

export function useSkipDuration() {
  const [skipDuration, setSkipDuration] = useState<number>(DEFAULT_SKIP);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await getValue<number>(StorageKeys.playbackSkip);
      if (!cancelled && typeof saved === "number" && Number.isFinite(saved)) {
        setSkipDuration(clamp(saved));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const set = useCallback((next: number) => {
    const v = clamp(next);
    setSkipDuration(v);
    void setValue(StorageKeys.playbackSkip, v);
  }, []);

  return { skipDuration, setSkipDuration: set, clamp };
}
