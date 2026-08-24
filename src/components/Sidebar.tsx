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
  onToggleFavorite: (id: string) => void;
  loading: boolean;
  onHome: () => void;
  onDisconnect: () => void;
}

export function Sidebar({
  channels,
  activeId,
  favoriteIds,
  showFavoritesOnly,
  onToggleShowFavorites,
  onSelect,
  onToggleFavorite,
  loading,
  onHome,
  onDisconnect,
}: SidebarProps) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("All");

  const groups = useMemo(() => {
    const set = new Set<string>(["All"]);
    channels.forEach((c) => set.add(c.group));
    return Array.from(set);
  }, [channels]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return channels.filter((c) => {
      if (showFavoritesOnly && !favoriteIds.has(c.id)) return false;
      if (group !== "All" && c.group !== group) return false;
      if (term && !c.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [channels, search, group, showFavoritesOnly, favoriteIds]);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-brand">IPTV Player</span>
        <div className="sidebar-actions">
          <button className="change-source" onClick={onHome} title="Back to dashboard">
            Home
          </button>
          <button className="change-source" onClick={onDisconnect} title="Change source">
            Change source
          </button>
        </div>
      </div>

      <div className="filters">
        <input
          type="text"
          placeholder="Search…"
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
