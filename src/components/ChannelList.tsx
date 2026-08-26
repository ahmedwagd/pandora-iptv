import { memo, useMemo, useState } from "react";
import type { Channel } from "../types";
import { MediaImage } from "./MediaImage";
import { EmptyState } from "./shared/EmptyState";

interface ChannelListProps {
  channels: Channel[];
  activeId: string | null;
  favoriteIds: Set<string>;
  onSelect: (channel: Channel) => void;
  onToggleFavorite: (id: string) => void;
  showFavorite?: boolean;
  loading?: boolean;
}

const ChannelRow = memo(function ChannelRow({
  ch,
  idx,
  activeId,
  favoriteIds,
  onSelect,
  onToggleFavorite,
  showFavorite,
}: {
  ch: Channel;
  idx: number;
  activeId: string | null;
  favoriteIds: Set<string>;
  onSelect: (c: Channel) => void;
  onToggleFavorite: (id: string) => void;
  showFavorite: boolean;
}) {
  const isActive = ch.id === activeId;
  const isFav = favoriteIds.has(ch.id);
  return (
    <li
      className={`channel-row ${isActive ? "active" : ""}`}
      onClick={() => onSelect(ch)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(ch);
        }
      }}
      tabIndex={0}
      role="option"
      aria-selected={isActive}
    >
      <span className="channel-num" aria-hidden>
        {String(idx + 1).padStart(2, "0")}
      </span>
      <MediaImage
        src={ch.logo}
        alt={ch.name}
        className="channel-logo"
        placeholderClassName="channel-logo-placeholder"
        fallback={ch.name[0] ?? "?"}
      />
      <span className="channel-name">{ch.name}</span>
      {showFavorite && (
        <button
          type="button"
          className={`favorite-btn ${isFav ? "is-favorite" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(ch.id);
          }}
          aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={isFav}
        >
          ★
        </button>
      )}
    </li>
  );
});

export function ChannelList({
  channels,
  activeId,
  favoriteIds,
  onSelect,
  onToggleFavorite,
  showFavorite = true,
  loading = false,
}: ChannelListProps) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("All");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const groups = useMemo(() => {
    const set = new Set<string>(["All"]);
    channels.forEach((c) => set.add(c.group));
    return Array.from(set);
  }, [channels]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return channels.filter((c) => {
      if (favoritesOnly && !favoriteIds.has(c.id)) return false;
      if (group !== "All" && c.group !== group) return false;
      if (term && !c.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [channels, search, group, favoritesOnly, favoriteIds]);

  return (
    <div className="channel-panel">
      <div className="filters">
        <div className="filter-row">
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search"
          />
          {showFavorite && (
            <button
              className={`favorites-toggle ${favoritesOnly ? "active" : ""}`}
              onClick={() => setFavoritesOnly((v) => !v)}
              aria-pressed={favoritesOnly}
              title={favoritesOnly ? "Show all" : "Show favorites only"}
            >
              ★
            </button>
          )}
        </div>
        <div className="filter-row filter-row--meta">
          <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Filter by group">
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <span className="filter-count">{filtered.length}</span>
        </div>
      </div>

      {loading ? (
        <div className="channel-list-empty">
          <div className="colorbar colorbar--loading" style={{ height: 2, marginBottom: 12 }} aria-hidden />
          <span> Tuning signal…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="channel-list-empty">
          <EmptyState message="No channels match your search." />
        </div>
      ) : (
        <ul className="channel-list" role="listbox" aria-label="Channels">
          {filtered.map((ch, idx) => (
            <ChannelRow
              key={ch.id}
              ch={ch}
              idx={idx}
              activeId={activeId}
              favoriteIds={favoriteIds}
              onSelect={onSelect}
              onToggleFavorite={onToggleFavorite}
              showFavorite={showFavorite}
            />
          ))}
        </ul>
      )}
    </div>
  );
}