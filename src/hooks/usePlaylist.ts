import { useCallback, useEffect, useRef, useState } from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { parseM3U } from "../lib/m3uParser";
import {
  getXtreamLiveChannels,
  getXtreamMovieDetail,
  getXtreamMovies,
  getXtreamSeasons,
  getXtreamSeries,
} from "../lib/xtream";
import { toErrorString } from "../lib/errors";
import type { Channel, MovieDetail, Season, Series, XtreamCreds } from "../types";

export function usePlaylist() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [movies, setMovies] = useState<Channel[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [activeSeries, setActiveSeries] = useState<Series | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [movieDetail, setMovieDetail] = useState<MovieDetail | null>(null);
  const [movieDetailLoading, setMovieDetailLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [moviesLoading, setMoviesLoading] = useState(false);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);
  const [sourceKind, setSourceKind] = useState<"m3u" | "xtream" | null>(null);

  const credsRef = useRef<XtreamCreds | null>(null);
  const vodAbortRef = useRef<AbortController | null>(null);
  const seriesAbortRef = useRef<AbortController | null>(null);
  const episodesAbortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      vodAbortRef.current?.abort();
      seriesAbortRef.current?.abort();
      episodesAbortRef.current?.abort();
      detailAbortRef.current?.abort();
    };
  }, []);

  const resetContent = useCallback(() => {
    setMovies([]);
    setSeries([]);
    setActiveSeries(null);
    setSeasons([]);
  }, []);

  const abortBackground = useCallback(() => {
    vodAbortRef.current?.abort();
    seriesAbortRef.current?.abort();
    episodesAbortRef.current?.abort();
    detailAbortRef.current?.abort();
    vodAbortRef.current = null;
    seriesAbortRef.current = null;
    episodesAbortRef.current = null;
    detailAbortRef.current = null;
  }, []);

  const loadFromUrl = useCallback(
    async (url: string, label?: string) => {
      abortBackground();
      setLoading(true);
      setError(null);
      resetContent();
      try {
        const res = await tauriFetch(url, { method: "GET" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        // If user pasted a single HLS manifest (e.g. https://test-streams.mux.dev/.../x36xhzz.m3u8) as a “playlist”,
        // parseM3U would mis-parse its #EXT-X-STREAM-INF variants as channels with relative URLs like url_0/...
        // which then fail as “all 5 sources exhausted”. Detect HLS master and treat as single channel.
        const isHlsMaster = text.includes("#EXT-X-STREAM-INF") && !text.includes('#EXTINF:');
        let parsed = parseM3U(text);
        if (isHlsMaster) {
          // HLS master detected — the URL itself is the stream, not a channel list
          if (parsed.length > 0 && parsed[0].url.startsWith("url_")) {
            // mis-parsed variants — replace with single entry
            parsed = [];
          }
          if (parsed.length === 0) {
            const name = label ?? url.split("/").pop()?.replace(".m3u8","") ?? "HLS Stream";
            parsed = [{ id: `hls:${url}`, name, url, group: "HLS", kind: "live" as const }];
          }
        }
        if (parsed.length === 0) throw new Error("No channels found — check the playlist URL.");
        setChannels(parsed);
        setSourceLabel(label ?? url);
        setSourceKind("m3u");
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") return;
        setError(toErrorString(e));
      } finally {
        setLoading(false);
      }
    },
    [resetContent, abortBackground]
  );

  const loadFromFile = useCallback(async () => {
    setError(null);
    const path = await open({
      multiple: false,
      filters: [{ name: "Playlist", extensions: ["m3u", "m3u8", "txt"] }],
    });
    if (!path || typeof path !== "string") return;

    abortBackground();
    setLoading(true);
    resetContent();
    try {
      const text = await readTextFile(path);
      const parsed = parseM3U(text);
      if (parsed.length === 0) throw new Error("No channels found in this file.");
      setChannels(parsed);
      setSourceLabel(path);
      setSourceKind("m3u");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read file.");
    } finally {
      setLoading(false);
    }
  }, [resetContent, abortBackground]);

  const loadFromXtream = useCallback(
    async (creds: XtreamCreds) => {
      abortBackground();
      setLoading(true);
      setError(null);
      resetContent();
      credsRef.current = creds;
      try {
        const live = await getXtreamLiveChannels(creds, tauriFetch);
        setChannels(live);
        setSourceLabel(`Xtream: ${creds.server}`);
        setSourceKind("xtream");
      } catch (e) {
        setError(toErrorString(e));
      } finally {
        setLoading(false);
      }

      // Background loads with abortable signals
      const vodCtrl = new AbortController();
      const seriesCtrl = new AbortController();
      vodAbortRef.current = vodCtrl;
      seriesAbortRef.current = seriesCtrl;

      setMoviesLoading(true);
      setSeriesLoading(true);
      getXtreamMovies(creds, tauriFetch, { signal: vodCtrl.signal })
        .then((data) => {
          if (!vodCtrl.signal.aborted) setMovies(data);
        })
        .catch((e) => {
          if ((e as DOMException)?.name === "AbortError") return;
          console.warn("Failed to load movies:", toErrorString(e));
        })
        .finally(() => {
          if (!vodCtrl.signal.aborted) setMoviesLoading(false);
        });

      getXtreamSeries(creds, tauriFetch, { signal: seriesCtrl.signal })
        .then((data) => {
          if (!seriesCtrl.signal.aborted) setSeries(data);
        })
        .catch((e) => {
          if ((e as DOMException)?.name === "AbortError") return;
          console.warn("Failed to load series:", toErrorString(e));
        })
        .finally(() => {
          if (!seriesCtrl.signal.aborted) setSeriesLoading(false);
        });
    },
    [resetContent, abortBackground]
  );

  const openSeries = useCallback(async (s: Series) => {
    setActiveSeries(s);
    setSeasons([]);
    const creds = credsRef.current;
    if (!creds) return;

    episodesAbortRef.current?.abort();
    const ctrl = new AbortController();
    episodesAbortRef.current = ctrl;

    setEpisodesLoading(true);
    try {
      const data = await getXtreamSeasons(creds, tauriFetch, s.id, { signal: ctrl.signal });
      if (!ctrl.signal.aborted) setSeasons(data);
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return;
      setError(toErrorString(e));
    } finally {
      if (!ctrl.signal.aborted) setEpisodesLoading(false);
    }
  }, []);

  const closeSeries = useCallback(() => {
    episodesAbortRef.current?.abort();
    setActiveSeries(null);
    setSeasons([]);
  }, []);

  const loadMovieDetail = useCallback(async (streamId: string) => {
    const creds = credsRef.current;
    if (!creds) return;
    detailAbortRef.current?.abort();
    const ctrl = new AbortController();
    detailAbortRef.current = ctrl;

    setMovieDetailLoading(true);
    setMovieDetail(null);
    try {
      const detail = await getXtreamMovieDetail(creds, tauriFetch, streamId, {
        signal: ctrl.signal,
      });
      if (!ctrl.signal.aborted) setMovieDetail(detail);
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return;
      console.warn("Failed to load movie details:", toErrorString(e));
    } finally {
      if (!ctrl.signal.aborted) setMovieDetailLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    abortBackground();
    setChannels([]);
    resetContent();
    setError(null);
    setSourceLabel(null);
    setSourceKind(null);
    credsRef.current = null;
  }, [resetContent, abortBackground]);

  return {
    channels,
    movies,
    series,
    activeSeries,
    seasons,
    movieDetail,
    movieDetailLoading,
    loading,
    moviesLoading,
    seriesLoading,
    episodesLoading,
    error,
    sourceLabel,
    sourceKind,
    loadFromUrl,
    loadFromFile,
    loadFromXtream,
    openSeries,
    closeSeries,
    loadMovieDetail,
    disconnect,
  };
}
