import { useEffect, useState } from "react";
import { useLang } from "../hooks/useLang";
import { strings } from "../i18n";
import type { ContentMode } from "../types";
import { ColorBar } from "./ColorBar";
import { ThemeToggle } from "../theme";

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
  labelKey: keyof typeof strings.en;
  unitKey: keyof typeof strings.en;
  count: (p: HomeProps) => number;
  loading: (p: HomeProps) => boolean;
  bg: string;
  accent: string;
  icon: React.ReactNode;
}[] = [
  {
    mode: "live",
    labelKey: "liveTv" as const,
    unitKey: "channels" as const,
    count: (p) => p.liveCount,
    loading: () => false,
    bg: "var(--tile-live-bg)",
    accent: "var(--tile-live-accent)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="6" width="20" height="13" rx="2" />
        <path d="M8 2l4 4 4-4" />
      </svg>
    ),
  },
  {
    mode: "movie",
    labelKey: "movies" as const,
    unitKey: "titles" as const,
    count: (p) => p.movieCount,
    loading: (p) => p.moviesLoading,
    bg: "var(--tile-movie-bg)",
    accent: "var(--tile-movie-accent)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
      </svg>
    ),
  },
  {
    mode: "series",
    labelKey: "series" as const,
    unitKey: "shows" as const,
    count: (p) => p.seriesCount,
    loading: (p) => p.seriesLoading,
    bg: "var(--tile-series-bg)",
    accent: "var(--tile-series-accent)",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polygon points="12 3 22 9 12 15 2 9 12 3" />
        <polyline points="2 14 12 20 22 14" />
      </svg>
    ),
  },
];

export function Home(props: HomeProps) {
  const { lang } = useLang();
  const s = strings[lang];
  const {
    sourceLabel,
    onSelect,
    onSettings,
    profileName,
    username,
    expDateFormatted,
    isTrial,
  } = props;
  void props.onDisconnect;
  const total = props.liveCount + props.movieCount + props.seriesCount;
  const now = useNow();
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

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
              {total.toLocaleString()} {s.titles} · {props.liveCount} {s.live.toLowerCase()}
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
          <ThemeToggle />
          <button className="home-settings" onClick={onSettings} aria-label={s.settings}>
            ⚙ {s.settings}
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
            aria-label={`${s[t.labelKey]} — ${countText(t.count(props), t.loading(props))} ${s[t.unitKey]}`}
          >
            <div className="home-tile-icon">{t.icon}</div>
            <div className="home-tile-label">{s[t.labelKey]}</div>
            <div className="home-tile-count">
              {countText(t.count(props), t.loading(props))} {s[t.unitKey]}
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
              <span
                className={`home-footer-exp ${expUrgency === "warn" ? "home-footer-exp--warn" : ""}`}
                title={isTrial ? "Trial account" : undefined}
              >
                {isTrial && <span className="home-footer-trial">Trial · </span>}
                {s.expires} {expDateFormatted}
              </span>
            ) : (
              <span className="home-footer-exp home-footer-exp--none">{s.noExpiration}</span>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}
