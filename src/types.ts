export type ContentKind = "live" | "movie" | "episode";

export interface Channel {
  id: string; // stable hash of name+url, used for favorites
  name: string;
  url: string;
  logo?: string;
  group: string; // "Uncategorized" if none set
  tvgId?: string;
  kind?: ContentKind; // absent for M3U/live channels
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
}

export interface WatchItem {
  id: string;
  name: string;
  poster?: string;
  kind: ContentKind;
  url: string;
  watchedAt: number;
}

export type ContentMode = "live" | "movie" | "series";
