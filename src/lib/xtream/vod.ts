import type { Channel, MovieDetail, Season, Series, XtreamCreds } from "../../types";
import type { FetchFn, XtreamCategory, XtreamEpisode, XtreamSeriesEntry, XtreamSeriesInfo, XtreamVodInfo, XtreamVodStream } from "./types";
import { fetchJson } from "./http";
import { buildApiUrl, buildXtreamEpisodeUrl, buildXtreamMovieUrl } from "./urls";
import { categoryNameMap, ratingString, yearFromDate } from "./utils";

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
  const durSecs = info.duration_secs != null ? Number(info.duration_secs) : undefined;
  return {
    poster: info.movie_image ?? undefined,
    backdrop,
    plot: info.plot ?? undefined,
    cast: info.cast ?? undefined,
    genre: info.genre ?? undefined,
    rating: ratingString(info.rating),
    year: yearFromDate(info.releasedate),
    duration: info.duration ?? undefined,
    director: info.director ?? undefined,
    country: info.country ?? undefined,
    durationSeconds: Number.isFinite(durSecs as number) ? (durSecs as number) : undefined,
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

  const rawEpisodes = info.episodes ?? {};
  const cover = info.info?.cover ?? undefined;
  let episodesBySeason: Record<string, XtreamEpisode[]> = {};
  if (Array.isArray(rawEpisodes)) {
    episodesBySeason = {};
    for (const ep of rawEpisodes as XtreamEpisode[]) {
      const key = String(ep.season);
      (episodesBySeason[key] ??= []).push(ep);
    }
  } else {
    episodesBySeason = rawEpisodes as Record<string, XtreamEpisode[]>;
  }
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
