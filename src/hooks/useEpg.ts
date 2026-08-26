import { useCallback, useEffect, useRef, useState } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { XtreamCreds } from "../types";
import type { EpgMap, EpgProgramme } from "../types/epg";
import { getXtreamShortEpg, getXtreamSimpleDataTable } from "../lib/xtream";
import { toErrorString } from "../lib/errors";

const TTL_MS = 30 * 60 * 1000;

export interface UseEpgReturn {
  epgMap: EpgMap;
  loading: boolean;
  error: string | null;
  refresh: (force?: boolean) => Promise<void>;
  getForChannel: (channelId: string) => { now?: EpgProgramme; next?: EpgProgramme } | undefined;
  fetchShort: (channelId: string) => Promise<EpgProgramme[]>;
  shortLoading: boolean;
}

export function useEpg(creds: XtreamCreds | null, enabled: boolean): UseEpgReturn {
  const [epgMap, setEpgMap] = useState<EpgMap>(() => new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shortLoading, setShortLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const shortAbortRef = useRef<AbortController | null>(null);
  const lastFetchRef = useRef<number>(0);
  const shortCacheRef = useRef<Map<string, EpgProgramme[]>>(new Map());
  const credsRef = useRef(creds);
  credsRef.current = creds;

  const refresh = useCallback(
    async (force = false) => {
      if (!credsRef.current || !enabled) return;
      if (!force && Date.now() - lastFetchRef.current < TTL_MS && epgMap.size > 0) return;

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setError(null);
      try {
        const map = await getXtreamSimpleDataTable(credsRef.current, tauriFetch as never, {
          signal: ctrl.signal,
        });
        if (ctrl.signal.aborted) return;
        setEpgMap(map);
        lastFetchRef.current = Date.now();
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
        setError(toErrorString(e));
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    },
    [enabled, epgMap.size]
  );

  const fetchShort = useCallback(async (channelId: string): Promise<EpgProgramme[]> => {
    if (!credsRef.current) return [];
    const cached = shortCacheRef.current.get(channelId);
    if (cached) return cached;

    shortAbortRef.current?.abort();
    const ctrl = new AbortController();
    shortAbortRef.current = ctrl;
    setShortLoading(true);
    try {
      const progs = await getXtreamShortEpg(credsRef.current, tauriFetch as never, channelId, {
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return [];
      shortCacheRef.current.set(channelId, progs);
      // also patch epgMap with now/next derived from short list
      if (progs.length > 0) {
        setEpgMap((prev) => {
          const next = new Map(prev);
          const now = Date.now();
          let nowProg: EpgProgramme | undefined;
          let nextProg: EpgProgramme | undefined;
          for (let i = 0; i < progs.length; i++) {
            const p = progs[i];
            if (p.startTime <= now && now < p.stopTime) {
              nowProg = p;
              nextProg = progs[i + 1];
              break;
            }
            if (p.startTime > now && !nowProg) {
              nextProg = p;
              break;
            }
          }
          next.set(channelId, { now: nowProg, next: nextProg });
          return next;
        });
      }
      return progs;
    } catch {
      return [];
    } finally {
      if (!ctrl.signal.aborted) setShortLoading(false);
    }
  }, []);

  const getForChannel = useCallback((channelId: string) => epgMap.get(channelId), [epgMap]);

  useEffect(() => {
    if (enabled && creds) {
      void refresh(false);
    } else {
      abortRef.current?.abort();
      setEpgMap(new Map());
      setError(null);
      lastFetchRef.current = 0;
    }
    return () => abortRef.current?.abort();
  }, [creds, enabled, refresh]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      shortAbortRef.current?.abort();
    };
  }, []);

  return { epgMap, loading, error, refresh, getForChannel, fetchShort, shortLoading };
}
