import { useEffect, useState } from "react";
import type { ContentMode } from "../types";
import { ColorBar } from "./ColorBar";

function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

interface HomeProps {
  liveCount: number;
  movieCount: number;
  seriesCount: number;
  moviesLoading: boolean;
  seriesLoading: boolean;
  sourceLabel: string | null;
  onSelect: (mode: ContentMode) => void;
  onDisconnect: () => void;
  onSettings: () => void;
  profileName?: string | null;
  username?: string | null;
  expDateFormatted?: string | null;
  expTimestamp?: number | null;
  isTrial?: boolean;
}

function countText(count: number, loading: boolean): string {
  if (loading) return "…";
  return count.toLocaleString();
}

const TILES: {
  mode: ContentMode;
  label: string;
  unit: string;
  count: (p: HomeProps) => number;
  loading: (p: HomeProps) => boolean;
  bg: string;
  accent: string;
  icon: React.ReactNode;
}[] = [
  {
    mode: "live",
    label: "Live TV",
    unit: "channels",
    count: (p) => p.liveCount,
    loading: () => false,
    bg: "linear-gradient(165deg, #123b2c 0%, #0d1511 72%)",
    accent: "#2ee6a8",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="6" width="20" height="13" rx="2" />
        <path d="M8 2l4 4 4-4" />
      </svg>
    ),
  },
  {
    mode: "movie",
    label: "Movies",
    unit: "titles",
    count: (p) => p.movieCount,
    loading: (p) => p.moviesLoading,
    bg: "linear-gradient(165deg, #0f2e2a 0%, #0d1511 72%)",
    accent: "#98d3b5",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
      </svg>
    ),
  },
  {
    mode: "series",
    label: "Series",
    unit: "shows",
    count: (p) => p.seriesCount,
    loading: (p) => p.seriesLoading,
    bg: "linear-gradient(165deg, #332815 0%, #0d1511 72%)",
    accent: "#ffc158",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polygon points="12 3 22 9 12 15 2 9 12 3" />
        <polyline points="2 14 12 20 22 14" />
      </svg>
    ),
  },
];

export function Home(props: HomeProps) {
  const { sourceLabel, onSelect, onDisconnect, onSettings, profileName, username, expDateFormatted, isTrial } = props;
  const total = props.liveCount + props.movieCount + props.seriesCount;
  const now = useNow();
  const dateStr = now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "short", day: "numeric" });
  const timeStr = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // expiration urgency: red if <7 days or expired
  let expUrgency: "ok" | "warn" | "none" = "none";
  const expTs = props.expTimestamp;
  if (expDateFormatted && typeof expTs === "number" && expTs) {
    const days = Math.ceil((expTs - Date.now()) / 86400000);
    expUrgency = days <= 7 ? "warn" : "ok";
  }

  return (
    <div className="home">
      <header className="home-header">
        <div className="home-header-block">
          <div className="home-header-top">
            <h1 className="home-title">PandoraIPTV</h1>
            <span className="home-signal">
              <span className="signal-dot" aria-hidden>
                ●
              </span>{" "}
              {total.toLocaleString()} titles · {props.liveCount} on air
            </span>
          </div>
          {sourceLabel && <p className="home-subtitle">{sourceLabel}</p>}
          <div className="home-datetime" aria-live="off">
            <span className="home-date">{dateStr}</span>
            <span className="home-datetime-dot" aria-hidden>
              ·
            </span>
            <span className="home-time">{timeStr}</span>
          </div>
        </div>
        <div className="home-header-actions">
          <button className="home-settings" onClick={onSettings} aria-label="Settings">
            ⚙ Settings
          </button>
          <button className="home-logout" onClick={onDisconnect}>
            Exit
          </button>
        </div>
      </header>

      <div className="home-grid">
        {TILES.map((t, idx) => (
          <button
            key={t.mode}
            className="home-tile"
            style={{ "--tile-bg": t.bg, "--tile-accent": t.accent } as React.CSSProperties}
            data-ch={`CH 0${idx + 1}`}
            data-num={`0${idx + 1}`}
            onClick={() => onSelect(t.mode)}
            aria-label={`${t.label} — ${countText(t.count(props), t.loading(props))} ${t.unit}`}
          >
            <div className="home-tile-icon">{t.icon}</div>
            <div className="home-tile-label">{t.label}</div>
            <div className="home-tile-count">
              {countText(t.count(props), t.loading(props))} {t.unit}
            </div>
            <ColorBar className="home-tile-bar" />
          </button>
        ))}
      </div>

      {(profileName || username || expDateFormatted) && (
        <footer className="home-footer">
          <div className="home-footer-left">
            {profileName && (
              <span className="home-footer-profile">
                <span aria-hidden>●</span> {profileName}
                {username && <span className="home-footer-sub"> · {username}</span>}
              </span>
            )}
            {!profileName && username && <span className="home-footer-profile">{username}</span>}
          </div>
          <div className="home-footer-right">
            {expDateFormatted ? (
              <span className={`home-footer-exp ${expUrgency === "warn" ? "home-footer-exp--warn" : ""}`} title={isTrial ? "Trial account" : undefined}>
                {isTrial && <span className="home-footer-trial">Trial · </span>}
                Expires {expDateFormatted}
              </span>
            ) : (
              <span className="home-footer-exp home-footer-exp--none">No expiration</span>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
