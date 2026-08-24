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
        <div className="sidebar-brand-block">
          <span className="sidebar-brand">IPTV Player</span>
          <span className="sidebar-signal">
            <span className="signal-dot" aria-hidden>
              ●
            </span>{" "}
            {filtered.length} on air · {groups.length - 1} groups
          </span>
        </div>
        <div className="sidebar-actions">
          <button className="change-source" onClick={onHome} title="Back to dashboard">
            Home
          </button>
          <button className="change-source" onClick={onDisconnect} title="Change source">
            Exit
          </button>
        </div>
      </div>

      <div className="filters">
        <div className="filter-row">
          <input
            type="text"
            placeholder="Search channels…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search channels"
          />
          <button
            className={`favorites-toggle ${showFavoritesOnly ? "active" : ""}`}
            onClick={onToggleShowFavorites}
            aria-pressed={showFavoritesOnly}
            title={showFavoritesOnly ? "Show all channels" : "Show favorites only"}
          >
            ★
          </button>
        </div>
        <div className="filter-row filter-row--meta">
          <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Filter by group">
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <span className="filter-count">{filtered.length} channels</span>
        </div>
      </div>

      {loading ? (
        <div className="channel-list-empty">
          <div className="colorbar colorbar--loading" style={{ height: 2, marginBottom: 12 }} aria-hidden />
          <span> Tuning signal…</span>
        </div>
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
