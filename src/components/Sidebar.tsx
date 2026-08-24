import { useMemo, useState } from "react";
import type { Channel } from "../types";
import { ChannelList } from "./ChannelList";

interface SidebarProps {
  channels: Channel[];
  activeId: string | null;
  favoriteIds: Set<string>;
  showFavoritesOnly: boolean;
  onToggleShowFavorites: () => void;
  onSelect: (channel: Channel) => void;
  onToggleFavorite: (channel: Channel) => void;
  onLoadUrl: (url: string) => void;
  onLoadFile: () => void;
  loading: boolean;
}

export function Sidebar({
  channels,
  activeId,
  favoriteIds,
  showFavoritesOnly,
  onToggleShowFavorites,
  onSelect,
  onToggleFavorite,
  onLoadUrl,
  onLoadFile,
  loading,
}: SidebarProps) {
  const [urlInput, setUrlInput] = useState("");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("All");

  const groups = useMemo(() => {
    const set = new Set<string>(["All"]);
    channels.forEach((c) => set.add(c.group));
    return Array.from(set);
  }, [channels]);

  const filtered = useMemo(() => {
    return channels.filter((c) => {
      if (showFavoritesOnly && !favoriteIds.has(c.id)) return false;
      if (group !== "All" && c.group !== group) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [channels, search, group, showFavoritesOnly, favoriteIds]);

  return (
    <div className="sidebar">
      <div className="playlist-loader">
        <input
          type="text"
          placeholder="Paste M3U/M3U8 URL…"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && urlInput.trim()) onLoadUrl(urlInput.trim());
          }}
        />
        <button
          disabled={!urlInput.trim() || loading}
          onClick={() => onLoadUrl(urlInput.trim())}
        >
          Load
        </button>
        <button onClick={onLoadFile} disabled={loading}>
          Open File…
        </button>
      </div>

      <div className="filters">
        <input
          type="text"
          placeholder="Search channels…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <button
          className={`favorites-toggle ${showFavoritesOnly ? "active" : ""}`}
          onClick={onToggleShowFavorites}
        >
          ★ Favorites
        </button>
      </div>

      {loading ? (
        <p className="channel-list-empty">Loading playlist…</p>
      ) : (
        <ChannelList
          channels={filtered}
          activeId={activeId}
          favoriteIds={favoriteIds}
          onSelect={onSelect}
          onToggleFavorite={onToggleFavorite}
        />
      )}
    </div>
  );
}
