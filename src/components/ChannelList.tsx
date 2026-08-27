import { useEffect, useMemo, useState } from "react";
import { useEpgReminders } from "../hooks/useEpgReminders";
import type { Channel } from "../types";
import type { EpgProgramme } from "../types/epg";
import { EmptyState } from "./shared/EmptyState";
import { usePlaybackResume } from "../hooks/usePlaybackResume";
import { ChannelRow, isResumableForList } from "./ChannelRow";
import { VIRTUAL_THRESHOLD, VirtualChannelList } from "./VirtualChannelList";

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
  onEpgReminder?: (ch: Channel, prog: EpgProgramme) => void;
  /** Live-only: start from a categories list and drill into channels per category. */
  categoriesFirst?: boolean;
  epgLoading?: boolean;
}

const CHANNEL_SKELETON_COUNT = 8;

function ChannelRowSkeleton() {
  return (
    <li className="channel-row skeleton" aria-hidden>
      <span className="channel-num" aria-hidden />
      <span className="channel-logo skeleton-logo" aria-hidden />
      <div className="ch-main">
        <span className="skeleton-line" style={{ width: "58%" }} />
        <span className="skeleton-line" style={{ width: "38%", height: 8 }} />
      </div>
    </li>
  );
}

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
  categoriesFirst = false,
  epgLoading = false,
}: ChannelListProps) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("All");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [epgSearch, setEpgSearch] = useState(false);
  const [cat, setCat] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const {
    has: hasReminder,
    add: addReminder,
    remove: removeReminder,
    due,
    dismissDue,
  } = useEpgReminders(profileId ?? null);

  const handleToggleReminder = (ch: Channel, prog: EpgProgramme) => {
    if (hasReminder(ch.id, prog.startTime)) removeReminder(`${ch.id}::${prog.startTime}`);
    else
      addReminder({
        channelId: ch.id,
        channelName: ch.name,
        title: prog.title,
        startTime: prog.startTime,
        stopTime: prog.stopTime,
      });
  };

  const groups = useMemo(() => {
    const collator = new Intl.Collator(undefined, { sensitivity: "base" });
    const set = new Set<string>();
    channels.forEach((c) => set.add(c.group));
    const sorted = Array.from(set).sort((a, b) => collator.compare(a, b));
    return ["All", ...sorted];
  }, [channels]);

  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    channels.forEach((c) => m.set(c.group, (m.get(c.group) ?? 0) + 1));
    return m;
  }, [channels]);

  const { positions, getPosition } = usePlaybackResume(profileId ?? null);
  const continueIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, pos] of Object.entries(positions)) {
      if (pos && isResumableForList(pos.position, pos.duration)) set.add(id);
    }
    return set;
  }, [positions]);
  const favCount = useMemo(
    () => channels.filter((c) => favoriteIds.has(c.id)).length,
    [channels, favoriteIds]
  );
  const contCount = useMemo(
    () => channels.filter((c) => continueIds.has(c.id)).length,
    [channels, continueIds]
  );
  const catRows = useMemo(
    () => [
      { key: "All", name: "All channels", count: channels.length },
      { key: "Favorites", name: "Favorites", count: favCount },
      { key: "Continue", name: "Continue", count: contCount },
      ...groups
        .filter((g) => g !== "All")
        .map((g) => ({ key: g, name: g, count: catCounts.get(g) ?? 0 })),
    ],
    [channels.length, favCount, contCount, groups, catCounts]
  );
  const catLabel = (c: string) =>
    c === "All" ? "All channels" : c === "Favorites" ? "Favorites" : c === "Continue" ? "Continue" : c;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return channels.filter((c) => {
      if (favoritesOnly && !favoriteIds.has(c.id)) return false;
      if (categoriesFirst) {
        if (cat === "Favorites") {
          if (!favoriteIds.has(c.id)) return false;
        } else if (cat === "Continue") {
          if (!continueIds.has(c.id)) return false;
        } else if (cat && cat !== "All" && c.group !== cat) {
          return false;
        }
      } else if (group !== "All" && c.group !== group) {
        return false;
      }
      if (!term) return true;
      if (c.name.toLowerCase().includes(term)) return true;
      if (epgSearch && getEpgForChannel) {
        const epg = getEpgForChannel(c.id);
        if (epg?.now && epg.now.title.toLowerCase().includes(term)) return true;
        if (epg?.next && epg.next.title.toLowerCase().includes(term)) return true;
        if (epg?.now?.description && epg.now.description.toLowerCase().includes(term)) return true;
      }
      return false;
    });
  }, [channels, search, group, cat, categoriesFirst, favoritesOnly, favoriteIds, epgSearch, getEpgForChannel, continueIds]);

  return (
    <div className="channel-panel">
      {due && (
        <div className="epg-due-banner" role="alert">
          <span className="epg-due-dot" aria-hidden>
            ●
          </span>
          <span className="epg-due-text">
            "{due.title}" starting now on <strong>{due.channelName}</strong>
          </span>
          <button
            type="button"
            className="epg-due-dismiss"
            onClick={dismissDue}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {categoriesFirst && cat === null ? (
        <div className="cat-view" role="listbox" aria-label="Categories">
          <div className="cat-eyebrow">
            <span>Channels</span>
            <span>{channels.length}</span>
          </div>
          {catRows.map((r) => (
            <button
              key={r.key}
              type="button"
              className="cat-row"
              role="option"
              onClick={() => setCat(r.key)}
            >
              <span className="cat-name">{r.name}</span>
              <span className="cat-count">{r.count}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          {categoriesFirst && (
            <div className="cat-bar">
              <button
                type="button"
                className="cat-back"
                onClick={() => setCat(null)}
                aria-label="Back to categories"
              >
                ←
              </button>
              <span className="cat-bar-title">{catLabel(cat ?? "All")}</span>
              <span className="cat-bar-count">{filtered.length}</span>
            </div>
          )}
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
            <div className="filter-row filter-row--epg">
              <label className="epg-search-toggle">
                <input
                  type="checkbox"
                  checked={epgSearch}
                  onChange={(e) => setEpgSearch(e.target.checked)}
                />{" "}
                Search programmes
              </label>
              {epgLoading && (
                <span
                  className="inline-loader"
                  style={{ width: 12, height: 12, borderWidth: 1.5 }}
                  aria-hidden
                  title="Loading programme guide"
                />
              )}
            </div>
            {!categoriesFirst && (
              <div className="filter-row filter-row--meta">
                <select
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                  aria-label="Filter by group"
                >
                  {groups.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <span className="filter-count">{filtered.length}</span>
              </div>
            )}
          </div>

          {loading && channels.length === 0 ? (
            <ul className="channel-list" aria-busy="true" aria-live="polite" aria-label="Loading channels">
              {Array.from({ length: CHANNEL_SKELETON_COUNT }).map((_, i) => (
                <ChannelRowSkeleton key={i} />
              ))}
            </ul>
          ) : loading ? (
            <div className="channel-list-empty" role="status" aria-live="polite">
              <span className="inline-loader" aria-hidden style={{ width: 14, height: 14, borderWidth: 2 }} />
              <span> Tuning signal…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="channel-list-empty">
              <EmptyState message="No channels match your search." />
            </div>
          ) : filtered.length > VIRTUAL_THRESHOLD ? (
            <VirtualChannelList
              filtered={filtered}
              activeId={activeId}
              favoriteIds={favoriteIds}
              onSelect={onSelect}
              onToggleFavorite={onToggleFavorite}
              showFavorite={showFavorite}
              getEpgForChannel={getEpgForChannel}
              profileId={profileId}
              now={now}
              hasReminder={hasReminder}
              onToggleReminder={handleToggleReminder}
              getPosition={getPosition}
            />
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
                  hasReminder={hasReminder}
                  now={now}
                  onToggleReminder={handleToggleReminder}
                  getPosition={getPosition}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
