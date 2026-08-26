import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { getValue, setValue } from "../lib/store";
import { scopedKey, StorageKeys } from "../lib/storageKeys";
import type { PlaybackPosition } from "../types";

type PositionsMap = Record<string, PlaybackPosition>;

/** Throttle: ignore saves within 4s for same id unless progress jumped >10s */
const MIN_SAVE_INTERVAL_MS = 4000;

/**
 * Per-profile playback positions keyed by Channel.id.
 * Module-level shared store so every mounted consumer (Player, DetailPage,
 * ChannelList, App) sees live updates — saves are visible immediately even
 * before the async disk write lands.
 */
interface StoreState {
  data: PositionsMap;
  loaded: boolean;
  loading: Promise<void> | null;
  subs: Set<() => void>;
}

const stores = new Map<string, StoreState>();

function getState(key: string): StoreState {
  let s = stores.get(key);
  if (!s) {
    s = { data: {}, loaded: false, loading: null, subs: new Set() };
    stores.set(key, s);
  }
  return s;
}

function notify(s: StoreState): void {
  for (const fn of s.subs) fn();
}

function ensureLoaded(key: string): void {
  const s = getState(key);
  if (s.loading || s.loaded) return;
  s.loading = (async () => {
    try {
      const saved = (await getValue<PositionsMap>(key)) ?? {};
      s.data = saved;
      s.loaded = true;
    } finally {
      s.loading = null;
    }
    notify(s);
  })();
}

function subscribe(key: string, fn: () => void): () => void {
  const s = getState(key);
  s.subs.add(fn);
  return () => {
    s.subs.delete(fn);
  };
}

function persist(key: string, next: PositionsMap): void {
  const s = getState(key);
  s.data = next;
  s.loaded = true;
  void setValue(key, next);
  notify(s);
}

export function usePlaybackResume(profileId: string | null = null) {
  const key = profileId
    ? scopedKey(StorageKeys.playbackPositions, profileId)
    : StorageKeys.playbackPositions;

  useEffect(() => {
    ensureLoaded(key);
  }, [key]);

  const positions = useSyncExternalStore(
    useCallback((fn: () => void) => subscribe(key, fn), [key]),
    useCallback(() => getState(key).data, [key])
  );

  const lastSaveRef = useRef<Map<string, number>>(new Map());

  const getPosition = useCallback(
    (id: string): PlaybackPosition | undefined => getState(key).data[id],
    [key]
  );

  const savePosition = useCallback(
    (id: string, position: number, duration: number) => {
      if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0) return;
      if (position < 5) return;
      if (duration - position < 10) return;
      const s = getState(key);
      const now = Date.now();
      const last = lastSaveRef.current.get(id) ?? 0;
      const prev = s.data[id];
      if (now - last < MIN_SAVE_INTERVAL_MS && prev && Math.abs(prev.position - position) < 10)
        return;
      lastSaveRef.current.set(id, now);
      const entry: PlaybackPosition = { position, duration, updatedAt: now };
      persist(key, { ...s.data, [id]: entry });
    },
    [key]
  );

  const clearPosition = useCallback(
    (id: string) => {
      const s = getState(key);
      if (!(id in s.data)) return;
      const next = { ...s.data };
      delete next[id];
      persist(key, next);
    },
    [key]
  );

  return { positions, getPosition, savePosition, clearPosition };
}