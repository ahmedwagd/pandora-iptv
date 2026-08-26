import { useCallback, useEffect, useRef, useState } from "react";
import { getValue, setValue } from "../lib/store";
import { scopedKey, StorageKeys } from "../lib/storageKeys";
import type { PlaybackPosition } from "../types";

type PositionsMap = Record<string, PlaybackPosition>;

/** Throttle: ignore saves within 4s for same id unless progress jumped >10s */
const MIN_SAVE_INTERVAL_MS = 4000;

/**
 * Per-profile playback positions keyed by Channel.id.
 * Each movie / episode (channel id) has its own entry — 10 movies = 10 keys.
 * Series episodes are distinct ids, so every episode tracks independently.
 */
export function usePlaybackResume(profileId: string | null = null) {
  const key = profileId
    ? scopedKey(StorageKeys.playbackPositions, profileId)
    : StorageKeys.playbackPositions;
  const [positions, setPositions] = useState<PositionsMap>({});
  const positionsRef = useRef<PositionsMap>({});
  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);
  const lastSaveRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = (await getValue<PositionsMap>(key)) ?? {};
      if (!cancelled) setPositions(saved);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  const getPosition = useCallback(
    (id: string): PlaybackPosition | undefined => positionsRef.current[id],
    []
  );

  const savePosition = useCallback(
    (id: string, position: number, duration: number) => {
      if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return;
      if (position < 5) return;
      if (duration - position < 10) return;
      const now = Date.now();
      const last = lastSaveRef.current.get(id) ?? 0;
      const prev = positionsRef.current[id];
      if (now - last < MIN_SAVE_INTERVAL_MS && prev && Math.abs(prev.position - position) < 10)
        return;
      lastSaveRef.current.set(id, now);
      const entry: PlaybackPosition = { position, duration, updatedAt: now };
      setPositions((prevMap) => {
        const next = { ...prevMap, [id]: entry };
        positionsRef.current = next;
        void setValue(key, next);
        return next;
      });
    },
    [key]
  );

  const clearPosition = useCallback(
    (id: string) => {
      setPositions((prevMap) => {
        if (!(id in prevMap)) return prevMap;
        const next = { ...prevMap };
        delete next[id];
        void setValue(key, next);
        return next;
      });
    },
    [key]
  );

  return { positions, getPosition, savePosition, clearPosition };
}
