import { useCallback, useRef, useState } from "react";
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
import type { Channel, MovieDetail, Season, Series, XtreamCreds } from "../types";

// tauriFetch can reject with non-Error values (plain strings/objects), so
// normalize whatever we get into something readable for the error banner.
function toErrorString(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  try {
    return JSON.stringify(e) || "Failed to load playlist.";
  } catch {
    return "Failed to load playlist.";
  }
}

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

  const resetContent = useCallback(() => {
    setMovies([]);
    setSeries([]);
    setActiveSeries(null);
    setSeasons([]);
  }, []);

  const loadFromUrl = useCallback(
    async (url: string, label?: string) => {
      setLoading(true);
      setError(null);
      resetContent();
      try {
        // Use the Tauri HTTP plugin rather than window.fetch: it runs
        // outside the webview's CORS restrictions, which most public
        // IPTV playlist hosts don't set headers for.
        const res = await tauriFetch(url, { method: "GET" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const parsed = parseM3U(text);
        if (parsed.length === 0) throw new Error("No channels found — check the playlist URL.");
        setChannels(parsed);
        setSourceLabel(label ?? url);
        setSourceKind("m3u");
      } catch (e) {
        setError(toErrorString(e));
      } finally {
        setLoading(false);
      }
    },
    [resetContent]
  );

  const loadFromFile = useCallback(async () => {
    setError(null);
    const path = await open({
      multiple: false,
      filters: [{ name: "Playlist", extensions: ["m3u", "m3u8", "txt"] }],
    });
    if (!path || typeof path !== "string") return;

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
  }, [resetContent]);

  const loadFromXtream = useCallback(
    async (creds: XtreamCreds) => {
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

      // Movies + series load in the background after live channels are ready.
      // Failures here are non-fatal: the account may simply have no VOD/series.
      setMoviesLoading(true);
      setSeriesLoading(true);
      getXtreamMovies(creds, tauriFetch)
        .then(setMovies)
        .catch((e) => console.warn("Failed to load movies:", toErrorString(e)))
        .finally(() => setMoviesLoading(false));
      getXtreamSeries(creds, tauriFetch)
        .then(setSeries)
        .catch((e) => console.warn("Failed to load series:", toErrorString(e)))
        .finally(() => setSeriesLoading(false));
    },
    [resetContent]
  );

  const openSeries = useCallback(async (s: Series) => {
    setActiveSeries(s);
    setSeasons([]);
    const creds = credsRef.current;
    if (!creds) return;

    setEpisodesLoading(true);
    try {
      setSeasons(await getXtreamSeasons(creds, tauriFetch, s.id));
    } catch (e) {
      setError(toErrorString(e));
    } finally {
      setEpisodesLoading(false);
    }
  }, []);

  const closeSeries = useCallback(() => {
    setActiveSeries(null);
    setSeasons([]);
  }, []);

  const loadMovieDetail = useCallback(async (streamId: string) => {
    const creds = credsRef.current;
    if (!creds) return;
    setMovieDetailLoading(true);
    setMovieDetail(null);
    try {
      setMovieDetail(await getXtreamMovieDetail(creds, tauriFetch, streamId));
    } catch (e) {
      console.warn("Failed to load movie details:", toErrorString(e));
    } finally {
      setMovieDetailLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setChannels([]);
    resetContent();
    setError(null);
    setSourceLabel(null);
    setSourceKind(null);
    credsRef.current = null;
  }, [resetContent]);

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
