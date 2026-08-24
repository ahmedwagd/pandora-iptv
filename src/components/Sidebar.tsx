import { useMemo, useState } from "react";
import type { Channel, ContentMode, Season, Series } from "../types";
import { ChannelList } from "./ChannelList";
import { SeriesList } from "./SeriesList";

interface SidebarProps {
  channels: Channel[];
  movies: Channel[];
  series: Series[];
  activeSeries: Series | null;
  seasons: Season[];
  activeId: string | null;
  favoriteIds: Set<string>;
  showFavoritesOnly: boolean;
  onToggleShowFavorites: () => void;
  onSelect: (channel: Channel) => void;
  onToggleFavorite: (channel: Channel) => void;
  loading: boolean;
  episodesLoading: boolean;
  sourceKind: "m3u" | "xtream" | null;
  contentMode: ContentMode;
  onContentModeChange: (mode: ContentMode) => void;
  onOpenSeries: (s: Series) => void;
  onCloseSeries: () => void;
  onHome: () => void;
  onDisconnect: () => void;
}

export function Sidebar({
  channels,
  movies,
  series,
  activeSeries,
  seasons,
  activeId,
  favoriteIds,
  showFavoritesOnly,
  onToggleShowFavorites,
  onSelect,
  onToggleFavorite,
  loading,
  episodesLoading,
  sourceKind,
  contentMode,
  onContentModeChange,
  onOpenSeries,
  onCloseSeries,
  onHome,
  onDisconnect,
}: SidebarProps) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("All");

  const isXtream = sourceKind === "xtream";
  const isSeriesView = contentMode === "series" && activeSeries !== null;

  const switchMode = (mode: ContentMode) => {
    setSearch("");
    setGroup("All");
    onContentModeChange(mode);
  };

  // The flat list of playable items for the current mode (live or movies).
  const currentList = contentMode === "live" ? channels : contentMode === "movie" ? movies : [];

  const groups = useMemo(() => {
    const source =
      contentMode === "series" ? series.map((s) => s.group) : currentList.map((c) => c.group);
    const set = new Set<string>(["All"]);
    source.forEach((g) => set.add(g));
    return Array.from(set);
  }, [currentList, series, contentMode]);

  const filteredChannels = useMemo(() => {
    const term = search.trim().toLowerCase();
    return currentList.filter((c) => {
      if (showFavoritesOnly && !favoriteIds.has(c.id)) return false;
      if (group !== "All" && c.group !== group) return false;
      if (term && !c.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [currentList, search, group, showFavoritesOnly, favoriteIds]);

  const filteredSeries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return series.filter((s) => {
      if (group !== "All" && s.group !== group) return false;
      if (term && !s.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [series, search, group]);

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

      {isXtream && (
        <div className="content-tabs">
          {(["live", "movie", "series"] as ContentMode[]).map((m) => (
            <button
              key={m}
              className={`content-tab ${contentMode === m ? "active" : ""}`}
              onClick={() => switchMode(m)}
            >
              {m === "live" ? "Live" : m === "movie" ? "Movies" : "Series"}
            </button>
          ))}
        </div>
      )}

      {!isSeriesView && (
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
          {contentMode !== "series" && (
            <button
              className={`favorites-toggle ${showFavoritesOnly ? "active" : ""}`}
              onClick={onToggleShowFavorites}
            >
              ★ Favorites
            </button>
          )}
        </div>
      )}

      {loading ? (
        <p className="channel-list-empty">Loading playlist…</p>
      ) : isSeriesView ? (
        <div className="series-seasons">
          <button className="series-back" onClick={onCloseSeries}>
            ← Back to series
          </button>
          <div className="series-title">{activeSeries?.name}</div>
          {episodesLoading ? (
            <p className="channel-list-empty">Loading episodes…</p>
          ) : (
            seasons.map((season) => (
              <div key={season.number} className="season-block">
                <div className="season-title">{season.name}</div>
                <ChannelList
                  channels={season.episodes}
                  activeId={activeId}
                  favoriteIds={favoriteIds}
                  onSelect={onSelect}
                  onToggleFavorite={onToggleFavorite}
                />
              </div>
            ))
          )}
        </div>
      ) : contentMode === "series" ? (
        <SeriesList series={filteredSeries} onOpen={onOpenSeries} />
      ) : (
        <ChannelList
          channels={filteredChannels}
          activeId={activeId}
          favoriteIds={favoriteIds}
          onSelect={onSelect}
          onToggleFavorite={onToggleFavorite}
        />
      )}
    </div>
  );
}
