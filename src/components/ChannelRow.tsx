import { memo } from "react";
import type { Channel } from "../types";
import type { EpgProgramme } from "../types/epg";
import { MediaImage } from "./MediaImage";
import { usePlaybackResume } from "../hooks/usePlaybackResume";

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

function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function progRange(p: EpgProgramme): string {
  return `${fmtClock(p.startTime)}–${fmtClock(p.stopTime)}`;
}

function progPct(p: EpgProgramme, nowMs: number): number {
  const span = p.stopTime - p.startTime;
  if (!Number.isFinite(span) || span <= 0) return 0;
  return Math.max(0, Math.min(1, (nowMs - p.startTime) / span));
}

export interface ChannelRowProps {
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
}

export const ChannelRow = memo(function ChannelRow({
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
}: ChannelRowProps) {
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
              <span className="ch-progress-fill" style={{ width: `${progPct(epg.now, now) * 100}%` }} />
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

export function isResumableForList(pos: number, dur: number): boolean {
  return isResumableRow(pos, dur);
}
