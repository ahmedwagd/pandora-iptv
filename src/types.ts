export type ContentKind = "live" | "movie" | "episode";

/** Branded channel id for type safety between M3U hash and Xtream numeric ids */
export type ChannelId = string & { readonly __brand: unique symbol };
export type ChannelHeaders = Record<string, string> & {
  "User-Agent"?: string;
  Referer?: string;
  Origin?: string;
};

export interface Channel {
  id: string; // stable hash of name+url, used for favorites (ChannelId branded in new code)
  name: string;
  url: string;
  altUrls?: string[]; // backup sources — tried after url exhausts its retries
  logo?: string;
  group: string; // "Uncategorized" if none set
  tvgId?: string;
  kind?: ContentKind; // absent for M3U/live channels
  catchup?: { days: number; source: string } | null;
  headers?: ChannelHeaders; // e.g. http-user-agent / http-referrer from #EXTVLCOPT
}

export interface PlaylistSource {
  kind: "url" | "file";
  value: string; // the URL or file path
  label: string; // display name for "recent playlists"
}

export interface XtreamCreds {
  server: string;
  username: string;
  password: string;
}

export interface Series {
  id: string; // series_id
  name: string;
  cover?: string;
  group: string; // category name
  plot?: string;
  cast?: string;
  genre?: string;
  rating?: string;
  year?: string;
}

export interface Season {
  number: number;
  name: string;
  episodes: Channel[];
}

export interface MovieDetail {
  poster?: string;
  backdrop?: string;
  plot?: string;
  cast?: string;
  genre?: string;
  rating?: string;
  year?: string;
  duration?: string;
  director?: string;
  country?: string;
  durationSeconds?: number;
}

export interface WatchItem {
  id: string;
  name: string;
  poster?: string;
  kind: ContentKind;
  url: string;
  watchedAt: number;
  /** last known playback position in seconds (VOD only) */
  position?: number;
  /** total duration in seconds at time of save */
  duration?: number;
  /** for episodes: parent series id */
  seriesId?: string;
}

export interface PlaybackPosition {
  position: number;
  duration: number;
  updatedAt: number;
}

export type ContentMode = "live" | "movie" | "series";
