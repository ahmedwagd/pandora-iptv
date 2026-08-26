import type { Channel, MovieDetail, Season, Series, XtreamCreds } from "../types";

interface XtreamCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}

interface XtreamLiveStream {
  stream_id: number;
  name: string;
  stream_icon: string | null;
  epg_channel_id: string | null;
  category_id: string;
}

interface XtreamVodStream {
  stream_id: number;
  name: string;
  stream_icon: string | null;
  category_id: string;
  container_extension: string;
}

interface XtreamSeriesEntry {
  series_id: number;
  name: string;
  cover: string | null;
  category_id: string;
  plot?: string | null;
  cast?: string | null;
  genre?: string | null;
  rating?: string | number | null;
  releaseDate?: string | null;
}

interface XtreamEpisode {
  id: string;
  episode_num: number;
  title: string;
  container_extension: string;
  season: number;
}

interface XtreamSeason {
  season_number: number;
  name: string;
  cover?: string | null;
}

interface XtreamSeriesInfo {
  info?: {
    cover?: string | null;
  };
  seasons?: XtreamSeason[];
  episodes?: Record<string, XtreamEpisode[]>;
}

interface XtreamVodInfo {
  info?: {
    movie_image?: string | null;
    backdrop?: string | null;
    plot?: string | null;
    cast?: string | null;
    genre?: string | null;
    rating?: string | number | null;
    releasedate?: string | null;
    duration?: string | null;
    backdrop_path?: string[] | null;
  };
}

interface XtreamAccountInfo {
  user_info?: {
    auth?: number;
    status?: string;
  };
}

export type FetchFn = (
  url: string,
  init?: { signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text?: () => Promise<string> }>;

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 1;

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal | undefined {
  if (!timeoutMs) return signal;
  const timeoutSignal = typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(timeoutMs) : undefined;
  if (!timeoutSignal) return signal;
  if (!signal) return timeoutSignal;
  // Combine: abort if either aborts
  const combined = new AbortController();
  const onAbort = () => combined.abort(signal.reason ?? timeoutSignal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  timeoutSignal.addEventListener("abort", () => combined.abort(timeoutSignal.reason), { once: true });
  return combined.signal;
}

function normalizeServer(server: string): string {
  let base = server.trim();
  if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
  return base.replace(/\/+$/, "");
}

function buildApiUrl(creds: XtreamCreds, action?: string): string {
  const base = normalizeServer(creds.server);
  const user = encodeURIComponent(creds.username);
  const pass = encodeURIComponent(creds.password);
  let url = `${base}/player_api.php?username=${user}&password=${pass}`;
  if (action) url += `&action=${action}`;
  return url;
}

function buildCredsPath(creds: XtreamCreds): string {
  return `${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}`;
}

export function buildXtreamLiveUrl(creds: XtreamCreds, streamId: number): string {
  return `${normalizeServer(creds.server)}/live/${buildCredsPath(creds)}/${streamId}.m3u8`;
}

export function buildXtreamMovieUrl(
  creds: XtreamCreds,
  streamId: number,
  extension: string
): string {
  return `${normalizeServer(creds.server)}/movie/${buildCredsPath(creds)}/${streamId}.${extension}`;
}

export function buildXtreamEpisodeUrl(
  creds: XtreamCreds,
  episodeId: string,
  extension: string
): string {
  return `${normalizeServer(creds.server)}/series/${buildCredsPath(creds)}/${episodeId}.${extension}`;
}

function categoryNameMap(categories: XtreamCategory[]): Map<string, string> {
  return new Map(categories.map((c) => [c.category_id, c.category_name]));
}

function yearFromDate(date?: string | null): string | undefined {
  if (!date) return undefined;
  const m = date.match(/^(\d{4})/);
  return m ? m[1] : undefined;
}

function ratingString(rating?: string | number | null): string | undefined {
  if (rating == null) return undefined;
  const n = Number(rating);
  return Number.isFinite(n) ? n.toFixed(1) : undefined;
}

async function fetchJson<T>(
  fetchFn: FetchFn,
  url: string,
  opts?: { signal?: AbortSignal; timeoutMs?: number; retries?: number }
): Promise<T> {
  const retries = opts?.retries ?? DEFAULT_RETRIES;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const signal = withTimeout(opts?.signal, timeoutMs);
      const res = await fetchFn(url, signal ? { signal } : undefined);
      if (!res.ok) {
        // Retry only on 5xx
        if (res.status >= 500 && attempt < retries) {
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      // Don't retry on abort
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      if (attempt < retries) {
        // Retry on network errors (non-HTTP) as well
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("HTTP") && !msg.includes("HTTP 5")) throw e;
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

async function assertAuth(
  creds: XtreamCreds,
  fetchFn: FetchFn,
  opts?: { signal?: AbortSignal }
): Promise<void> {
  const account = await fetchJson<XtreamAccountInfo>(fetchFn, buildApiUrl(creds), opts);
  const auth = account.user_info?.auth;
  if (auth !== 1) {
    const status = account.user_info?.status;
    throw new Error(status ? `Account is ${status}.` : "Invalid Xtream credentials.");
  }
}

export async function getXtreamLiveChannels(
  creds: XtreamCreds,
  fetchFn: FetchFn,
  opts?: { signal?: AbortSignal }
): Promise<Channel[]> {
  await assertAuth(creds, fetchFn, opts);

  const [categories, streams] = await Promise.all([
    fetchJson<XtreamCategory[]>(fetchFn, buildApiUrl(creds, "get_live_categories"), opts),
    fetchJson<XtreamLiveStream[]>(fetchFn, buildApiUrl(creds, "get_live_streams"), opts),
  ]);
  const nameByCat = categoryNameMap(categories);

  return streams.map((s) => ({
    id: String(s.stream_id),
    name: s.name,
    url: buildXtreamLiveUrl(creds, s.stream_id),
    logo: s.stream_icon ?? undefined,
    group: nameByCat.get(s.category_id) ?? "Uncategorized",
    tvgId: s.epg_channel_id ?? undefined,
    kind: "live" as const,
  }));
}

export async function getXtreamMovies(
  creds: XtreamCreds,
  fetchFn: FetchFn,
  opts?: { signal?: AbortSignal }
): Promise<Channel[]> {
  const [categories, streams] = await Promise.all([
    fetchJson<XtreamCategory[]>(fetchFn, buildApiUrl(creds, "get_vod_categories"), opts),
    fetchJson<XtreamVodStream[]>(fetchFn, buildApiUrl(creds, "get_vod_streams"), opts),
  ]);
  const nameByCat = categoryNameMap(categories);

  return streams.map((s) => ({
    id: `movie:${s.stream_id}`,
    name: s.name,
    url: buildXtreamMovieUrl(creds, s.stream_id, s.container_extension || "mkv"),
    logo: s.stream_icon ?? undefined,
    group: nameByCat.get(s.category_id) ?? "Uncategorized",
    kind: "movie" as const,
  }));
}

export async function getXtreamSeries(
  creds: XtreamCreds,
  fetchFn: FetchFn,
  opts?: { signal?: AbortSignal }
): Promise<Series[]> {
  const [categories, series] = await Promise.all([
    fetchJson<XtreamCategory[]>(fetchFn, buildApiUrl(creds, "get_series_categories"), opts),
    fetchJson<XtreamSeriesEntry[]>(fetchFn, buildApiUrl(creds, "get_series"), opts),
  ]);
  const nameByCat = categoryNameMap(categories);

  return series.map((s) => ({
    id: String(s.series_id),
    name: s.name,
    cover: s.cover ?? undefined,
    group: nameByCat.get(s.category_id) ?? "Uncategorized",
    plot: s.plot ?? undefined,
    cast: s.cast ?? undefined,
    genre: s.genre ?? undefined,
    rating: ratingString(s.rating),
    year: yearFromDate(s.releaseDate),
  }));
}

export async function getXtreamMovieDetail(
  creds: XtreamCreds,
  fetchFn: FetchFn,
  streamId: string,
  opts?: { signal?: AbortSignal }
): Promise<MovieDetail> {
  const data = await fetchJson<XtreamVodInfo>(
    fetchFn,
    buildApiUrl(creds, `get_vod_info&vod_id=${encodeURIComponent(streamId)}`),
    opts
  );
  const info = data.info ?? {};
  const backdrop = info.backdrop || info.backdrop_path?.[0] || undefined;

  return {
    poster: info.movie_image ?? undefined,
    backdrop,
    plot: info.plot ?? undefined,
    cast: info.cast ?? undefined,
    genre: info.genre ?? undefined,
    rating: ratingString(info.rating),
    year: yearFromDate(info.releasedate),
    duration: info.duration ?? undefined,
  };
}

export async function getXtreamSeasons(
  creds: XtreamCreds,
  fetchFn: FetchFn,
  seriesId: string,
  opts?: { signal?: AbortSignal }
): Promise<Season[]> {
  const info = await fetchJson<XtreamSeriesInfo>(
    fetchFn,
    buildApiUrl(creds, `get_series_info&series_id=${encodeURIComponent(seriesId)}`),
    opts
  );

  const episodesBySeason = info.episodes ?? {};
  const cover = info.info?.cover ?? undefined;
  const seasons: Season[] = (info.seasons ?? []).map((s) => ({
    number: s.season_number,
    name: s.name || `Season ${s.season_number}`,
    episodes: (episodesBySeason[String(s.season_number)] ?? []).map((ep) => ({
      id: `episode:${ep.id}`,
      name: ep.title || `S${ep.season} E${ep.episode_num}`,
      url: buildXtreamEpisodeUrl(creds, ep.id, ep.container_extension || "mkv"),
      logo: cover,
      group: s.name || `Season ${s.season_number}`,
      kind: "episode" as const,
    })),
  }));

  seasons.sort((a, b) => a.number - b.number);
  return seasons;
}

/** Convenience client wrapping creds + fetchFn + retry/timeout */
export class XtreamClient {
  constructor(
    private creds: XtreamCreds,
    private fetchFn: FetchFn,
    private opts: { timeoutMs?: number; retries?: number } = {}
  ) {}

  live(opts?: { signal?: AbortSignal }) {
    return getXtreamLiveChannels(this.creds, this.fetchFn, { ...this.opts, ...opts });
  }
  movies(opts?: { signal?: AbortSignal }) {
    return getXtreamMovies(this.creds, this.fetchFn, { ...this.opts, ...opts });
  }
  series(opts?: { signal?: AbortSignal }) {
    return getXtreamSeries(this.creds, this.fetchFn, { ...this.opts, ...opts });
  }
  movieDetail(streamId: string, opts?: { signal?: AbortSignal }) {
    return getXtreamMovieDetail(this.creds, this.fetchFn, streamId, { ...this.opts, ...opts });
  }
  seasons(seriesId: string, opts?: { signal?: AbortSignal }) {
    return getXtreamSeasons(this.creds, this.fetchFn, seriesId, { ...this.opts, ...opts });
  }
}
