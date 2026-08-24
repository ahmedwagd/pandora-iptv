import type { Channel, Season, Series, XtreamCreds } from "../types";

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
  seasons?: XtreamSeason[];
  episodes?: Record<string, XtreamEpisode[]>;
}

interface XtreamAccountInfo {
  user_info?: {
    auth?: number;
    status?: string;
  };
}

type FetchFn = (
  url: string
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

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

async function fetchJson<T>(fetchFn: FetchFn, url: string): Promise<T> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function assertAuth(creds: XtreamCreds, fetchFn: FetchFn): Promise<void> {
  const account = await fetchJson<XtreamAccountInfo>(fetchFn, buildApiUrl(creds));
  const auth = account.user_info?.auth;
  if (auth !== 1) {
    const status = account.user_info?.status;
    throw new Error(status ? `Account is ${status}.` : "Invalid Xtream credentials.");
  }
}

export async function getXtreamLiveChannels(
  creds: XtreamCreds,
  fetchFn: FetchFn
): Promise<Channel[]> {
  await assertAuth(creds, fetchFn);

  const [categories, streams] = await Promise.all([
    fetchJson<XtreamCategory[]>(fetchFn, buildApiUrl(creds, "get_live_categories")),
    fetchJson<XtreamLiveStream[]>(fetchFn, buildApiUrl(creds, "get_live_streams")),
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
  fetchFn: FetchFn
): Promise<Channel[]> {
  const [categories, streams] = await Promise.all([
    fetchJson<XtreamCategory[]>(fetchFn, buildApiUrl(creds, "get_vod_categories")),
    fetchJson<XtreamVodStream[]>(fetchFn, buildApiUrl(creds, "get_vod_streams")),
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
  fetchFn: FetchFn
): Promise<Series[]> {
  const [categories, series] = await Promise.all([
    fetchJson<XtreamCategory[]>(fetchFn, buildApiUrl(creds, "get_series_categories")),
    fetchJson<XtreamSeriesEntry[]>(fetchFn, buildApiUrl(creds, "get_series")),
  ]);
  const nameByCat = categoryNameMap(categories);

  return series.map((s) => ({
    id: String(s.series_id),
    name: s.name,
    cover: s.cover ?? undefined,
    group: nameByCat.get(s.category_id) ?? "Uncategorized",
  }));
}

export async function getXtreamSeasons(
  creds: XtreamCreds,
  fetchFn: FetchFn,
  seriesId: string
): Promise<Season[]> {
  const info = await fetchJson<XtreamSeriesInfo>(
    fetchFn,
    buildApiUrl(creds, `get_series_info&series_id=${encodeURIComponent(seriesId)}`)
  );

  const episodesBySeason = info.episodes ?? {};
  const seasons: Season[] = (info.seasons ?? []).map((s) => ({
    number: s.season_number,
    name: s.name || `Season ${s.season_number}`,
    episodes: (episodesBySeason[String(s.season_number)] ?? []).map((ep) => ({
      id: `episode:${ep.id}`,
      name: ep.title || `S${ep.season} E${ep.episode_num}`,
      url: buildXtreamEpisodeUrl(creds, ep.id, ep.container_extension || "mkv"),
      group: s.name || `Season ${s.season_number}`,
      kind: "episode" as const,
    })),
  }));

  seasons.sort((a, b) => a.number - b.number);
  return seasons;
}
