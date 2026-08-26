import { memo, useMemo, useState } from "react";
import type { Channel } from "../types";
import type { EpgProgramme } from "../types/epg";
import { MediaImage } from "./MediaImage";
import { EmptyState } from "./shared/EmptyState";
import { usePlaybackResume } from "../hooks/usePlaybackResume";

interface ChannelListProps {
  channels: Channel[];
  activeId: string | null;
  favoriteIds: Set<string>;
  onSelect: (channel: Channel) => void;
  onToggleFavorite: (id: string) => void;
  showFavorite?: boolean;
  loading?: boolean;
  getEpgForChannel?: (id: string) => { now?: EpgProgramme; next?: EpgProgramme } | undefined;
  profileId?: string | null;
}

function fmtResumeRow(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function isResumableRow(pos: number, dur: number): boolean {
  if (!Number.isFinite(pos) || !Number.isFinite(dur) || dur <= 0) return false;
  if (pos < 10) return false;
  if (dur - pos < 15) return false;
  const pct = pos / dur;
  return pct > 0.01 && pct < 0.985;
}
const ChannelRow = memo(function ChannelRow({
  ch,
  idx,
  activeId,
  favoriteIds,
  onSelect,
  onToggleFavorite,
  showFavorite,
  getEpgForChannel,
  profileId,
}: {
  ch: Channel;
  idx: number;
  activeId: string | null;
  favoriteIds: Set<string>;
  onSelect: (c: Channel) => void;
  onToggleFavorite: (id: string) => void;
  showFavorite: boolean;
  getEpgForChannel?: (id: string) => { now?: EpgProgramme; next?: EpgProgramme } | undefined;
  profileId?: string | null;
}) {
  const isActive = ch.id === activeId;
  const isFav = favoriteIds.has(ch.id);
  const epg = getEpgForChannel?.(ch.id);
  const { getPosition } = usePlaybackResume(profileId ?? null);
  const saved = getPosition(ch.id);
  const resumable = saved && isResumableRow(saved.position, saved.duration);

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
      <span className="channel-name-wrap">
        <span className="channel-name">{ch.name}</span>
        {resumable && <span className="channel-epg channel-epg--resume">↺ Resume {fmtResumeRow(saved!.position)} / {fmtResumeRow(saved!.duration)}</span>}
        {!resumable && epg?.now && <span className="channel-epg">Now: {epg.now.title}</span>}
        {!resumable && epg?.next && !epg?.now && <span className="channel-epg channel-epg--next">Next: {epg.next.title}</span>}
      </span>
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
  getEpgForChannel,
  profileId,
}: ChannelListProps) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("All");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const groups = useMemo(() => {
    const collator = new Intl.Collator(undefined, { sensitivity: "base" });
    const set = new Set<string>();
    channels.forEach((c) => set.add(c.group));
    const sorted = Array.from(set).sort((a, b) => collator.compare(a, b));
    return ["All", ...sorted];
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
            id="channel-search"
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
              getEpgForChannel={getEpgForChannel}
              profileId={profileId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}