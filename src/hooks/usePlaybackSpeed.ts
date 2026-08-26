import { useCallback, useEffect, useState } from "react";
import { getValue, setValue } from "../lib/store";
import { StorageKeys } from "../lib/storageKeys";

export const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;
export type SpeedOption = typeof SPEED_OPTIONS[number];

const DEFAULT_SPEED = 1;

function clampSpeed(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SPEED;
  // snap to nearest option
  let best: SpeedOption = SPEED_OPTIONS[0];
  let bestDiff = Infinity;
  for (const s of SPEED_OPTIONS) {
    const d = Math.abs(s - n);
    if (d < bestDiff) { bestDiff = d; best = s; }
  }
  return best;
}

export function usePlaybackSpeed() {
  const [speed, setSpeed] = useState<number>(DEFAULT_SPEED);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await getValue<number>(StorageKeys.playbackSpeed);
      if (!cancelled && typeof saved === "number" && Number.isFinite(saved)) {
        setSpeed(clampSpeed(saved));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveSpeed = useCallback((v: number) => {
    const s = clampSpeed(v);
    setSpeed(s);
    void setValue(StorageKeys.playbackSpeed, s);
  }, []);

  return { speed, saveSpeed, SPEED_OPTIONS };
}
