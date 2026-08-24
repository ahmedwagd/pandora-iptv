export interface Channel {
  id: string; // stable hash of name+url, used for favorites
  name: string;
  url: string;
  logo?: string;
  group: string; // "Uncategorized" if none set
  tvgId?: string;
}

export interface PlaylistSource {
  kind: "url" | "file";
  value: string; // the URL or file path
  label: string; // display name for "recent playlists"
}
