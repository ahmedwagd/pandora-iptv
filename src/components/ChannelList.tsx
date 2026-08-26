import { memo, useEffect, useMemo, useState } from "react";
import { useEpgReminders } from "../hooks/useEpgReminders";
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
  onEpgReminder?: (ch: Channel, prog: EpgProgramme) => void;
  /** Live-only: start from a categories list and drill into channels per category. */
  categoriesFirst?: boolean;
}

function fmtResumeRow(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const h = Math.floor(m / 60);
  if (h > 0)
    return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function isResumableRow(pos: number, dur: number): boolean {
  if (!Number.isFinite(pos) || !Number.isFinite(dur) || dur <= 0) return false;
  if (pos < 10) return false;
  if (dur - pos < 15) return false;
  const pct = pos / dur;
  return pct > 0.01 && pct < 0.985;
}
function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
function progRange(p: EpgProgramme): string {
  return `${fmtClock(p.startTime)}–${fmtClock(p.stopTime)}`;
}
function progPct(p: EpgProgramme, nowMs: number): number {
  const span = p.stopTime - p.startTime;
  if (!Number.isFinite(span) || span <= 0) return 0;
  return Math.max(0, Math.min(1, (nowMs - p.startTime) / span));
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
  hasReminder,
  onToggleReminder,
  now,
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
  hasReminder?: (id: string, start: number) => boolean;
  onToggleReminder?: (ch: Channel, prog: EpgProgramme) => void;
  now: number;
}) {
  const isActive = ch.id === activeId;
  const isFav = favoriteIds.has(ch.id);
  const epg = getEpgForChannel?.(ch.id);
  const { getPosition } = usePlaybackResume(profileId ?? null);
  const saved = getPosition(ch.id);
  const resumable = saved && isResumableRow(saved.position, saved.duration);
  void hasReminder;
  void onToggleReminder;

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
      <div className="ch-main">
        <div className="ch-line">
          <span className="channel-name">{ch.name}</span>
        </div>
        {resumable && (
          <span className="ch-resume">
            ↺ Resume {fmtResumeRow(saved!.position)} / {fmtResumeRow(saved!.duration)}
          </span>
        )}
        {!resumable && epg?.now && (
          <>
            <div className="ch-now">
              <span className="ch-now-tag" aria-hidden>
                <span className="ch-now-dot" />
                NOW
              </span>
              <span className="ch-now-time">{progRange(epg.now)}</span>
              <span className="ch-now-title" title={epg.now.title}>
                {epg.now.title}
              </span>
            </div>
            <div className="ch-progress" aria-hidden>
              <span
                className="ch-progress-fill"
                style={{ width: `${progPct(epg.now, now) * 100}%` }}
              />
            </div>
            {epg?.next && (
              <div className="ch-next">
                <span className="ch-next-title" title={epg.next.title}>
                  {epg.next.title}
                </span>
                <span className="ch-next-time">{fmtClock(epg.next.startTime)}</span>
              </div>
            )}
          </>
        )}
        {!resumable && !epg?.now && epg?.next && (
          <div className="ch-next">
            <span className="ch-next-title" title={epg.next.title}>
              {epg.next.title}
            </span>
            <span className="ch-next-time">{fmtClock(epg.next.startTime)}</span>
          </div>
        )}
      </div>
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
  categoriesFirst = false,
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

  const { positions } = usePlaybackResume(profileId ?? null);
  const continueIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, pos] of Object.entries(positions)) {
      if (pos && isResumableRow(pos.position, pos.duration)) set.add(id);
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

          {loading ? (
            <div className="channel-list-empty">
              <div
                className="colorbar colorbar--loading"
                style={{ height: 2, marginBottom: 12 }}
                aria-hidden
              />
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
                  hasReminder={hasReminder}
                  now={now}
                  onToggleReminder={(channel, prog) => {
                    if (hasReminder(channel.id, prog.startTime))
                      removeReminder(`${channel.id}::${prog.startTime}`);
                    else
                      addReminder({
                        channelId: channel.id,
                        channelName: channel.name,
                        title: prog.title,
                        startTime: prog.startTime,
                        stopTime: prog.stopTime,
                      });
                  }}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
