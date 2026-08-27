import type { Channel, MovieDetail, Season, Series, XtreamCreds } from "../../types";
import type { EpgMap, EpgProgramme } from "../../types/epg";

export interface XtreamCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}

export interface XtreamLiveStream {
  stream_id: number;
  name: string;
  stream_icon: string | null;
  epg_channel_id: string | null;
  category_id: string;
  tv_archive?: string | number | boolean | null;
  tv_archive_duration?: string | number | null;
  direct_source?: string | null;
}

export interface XtreamVodStream {
  stream_id: number;
  name: string;
  stream_icon: string | null;
  category_id: string;
  container_extension: string;
}

export interface XtreamSeriesEntry {
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

export interface XtreamEpisode {
  id: string;
  episode_num: number;
  title: string;
  container_extension: string;
  season: number;
}

export interface XtreamSeason {
  season_number: number;
  name: string;
  cover?: string | null;
}

export interface XtreamSeriesInfo {
  info?: { cover?: string | null };
  seasons?: XtreamSeason[];
  episodes?: Record<string, XtreamEpisode[]> | XtreamEpisode[];
}

export interface XtreamVodInfo {
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
    director?: string | null;
    country?: string | null;
    duration_secs?: string | number | null;
  };
}

export interface XtreamAccountInfo {
  user_info?: {
    auth?: number;
    status?: string;
    username?: string;
    password?: string;
    exp_date?: string | number | null;
    is_trial?: string | number | null;
    active_cons?: string | number | null;
    created_at?: string | number | null;
    max_connections?: string | number | null;
    allowed_output_formats?: string[] | null;
    message?: string | null;
  };
  server_info?: {
    url?: string | null;
    port?: string | number | null;
    https_port?: string | number | null;
    server_protocol?: string | null;
    rtmp_port?: string | number | null;
    timezone?: string | null;
    timestamp_now?: number | null;
  };
}

export interface XtreamAccount {
  username?: string;
  status: string | null;
  auth: number;
  expDate: string | null;
  expTimestamp: number | null;
  expDateFormatted: string | null;
  isTrial: boolean;
  maxConnections: string | null;
  activeConnections: string | null;
  createdAt: string | null;
  message: string | null;
}

export type FetchFn = (
  url: string,
  init?: { signal?: AbortSignal }
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text?: () => Promise<string>;
}>;

export type { Channel, MovieDetail, Season, Series, XtreamCreds, EpgMap, EpgProgramme };
