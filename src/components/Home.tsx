import { useEffect, useState } from "react";
import { useLang } from "../hooks/useLang";
import { strings } from "../i18n";
import type { ContentMode } from "../types";
import { ColorBar } from "./ColorBar";
import { ThemeToggle } from "../theme";
import { MediaImage } from "./MediaImage";
import type { PosterCard } from "./PosterGrid";

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
  continueItems?: PosterCard[];
  favoriteItems?: PosterCard[];
  onOpenContinue?: (id: string) => void;
  onOpenFavorite?: (id: string) => void;
  onSearchOpen?: () => void;
  onHelpOpen?: () => void;
  getPosition?: (id: string) => { position: number; duration: number } | undefined;
}

function countText(count: number, loading: boolean): string {
  if (loading) return "…";
  return count.toLocaleString();
}

function isResumableHome(pos: number, dur: number): boolean {
  if (!Number.isFinite(pos) || !Number.isFinite(dur) || dur <= 0) return false;
  if (pos < 10) return false;
  if (dur - pos < 15) return false;
  const pct = pos / dur;
  return pct > 0.01 && pct < 0.985;
}

function fmtResumeHome(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
  let isExpired = false;
  const expTs = props.expTimestamp;
  if (expDateFormatted && typeof expTs === "number" && expTs) {
    const days = Math.ceil((expTs - Date.now()) / 86400000);
    isExpired = days < 0;
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
          {props.onSearchOpen && (
            <button className="home-settings" onClick={props.onSearchOpen} aria-label="Search">
              🔍 Search
            </button>
          )}
          {props.onHelpOpen && (
            <button className="home-settings" onClick={props.onHelpOpen} aria-label="Help">
              ? Help
            </button>
          )}
          <ThemeToggle />
          <button className="home-settings" onClick={onSettings} aria-label={s.settings}>
            ⚙ {s.settings}
          </button>
        </div>
      </header>

      <div className="home-grid">
        {TILES.map((t, idx) => {
          const isTileLoading = t.loading(props);
          return (
            <button
              key={t.mode}
              className={`home-tile ${isTileLoading ? "home-tile--loading" : ""}`}
              style={{ "--tile-bg": t.bg, "--tile-accent": t.accent } as React.CSSProperties}
              data-ch={`CH 0${idx + 1}`}
              data-num={`0${idx + 1}`}
              data-key={`${idx + 1}`}
              onClick={() => onSelect(t.mode)}
              aria-label={`${s[t.labelKey]} — ${countText(t.count(props), isTileLoading)} ${s[t.unitKey]}`}
              aria-busy={isTileLoading}
              title={`Press ${idx + 1}`}
            >
              <div className="home-tile-icon">{t.icon}</div>
              <div className="home-tile-label">{s[t.labelKey]}</div>
              <div className="home-tile-count">
                {isTileLoading ? (
                  <>
                    <span className="inline-loader" style={{ width: 10, height: 10, borderWidth: 1.5 }} aria-hidden />
                    <span>…</span> {s[t.unitKey]}
                  </>
                ) : (
                  <>
                    {t.count(props).toLocaleString()} {s[t.unitKey]}
                  </>
                )}
              </div>
              <span className="home-tile-key" aria-hidden>
                Press {idx + 1}
              </span>
              <ColorBar className="home-tile-bar" />
            </button>
          );
        })}
      </div>

      {/* Home rails: Continue Watching + Favorites */}
      <div className="home-rails">
        <section className="home-rail" aria-label="Continue Watching">
          <h2 className="home-rail-title">Continue Watching</h2>
          {props.continueItems && props.continueItems.length > 0 ? (
            <div className="home-rail-row">
              {props.continueItems.slice(0, 3).map((card) => {
                const saved = props.getPosition?.(card.id);
                const resumable = saved ? isResumableHome(saved.position, saved.duration) : false;
                const pct = resumable && saved ? Math.min(100, Math.max(0, (saved.position / saved.duration) * 100)) : 0;
                return (
                  <button
                    key={card.id}
                    type="button"
                    className="home-rail-card"
                    onClick={() => props.onOpenContinue?.(card.id)}
                    aria-label={card.name}
                  >
                    <div className="home-rail-thumb">
                      <MediaImage
                        src={card.poster}
                        alt={card.name}
                        className="home-rail-img"
                        placeholderClassName="home-rail-placeholder"
                        fallback={card.name[0] ?? "?"}
                      />
                      {resumable && saved && (
                        <div className="ch-progress home-rail-progress" aria-hidden>
                          <span className="ch-progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                    <span className="home-rail-name" title={card.name}>
                      {card.name}
                    </span>
                    {resumable && saved && (
                      <span className="home-rail-resume">
                        ↺ {fmtResumeHome(saved.position)} / {fmtResumeHome(saved.duration)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="home-rail-empty">
              <span>No continue items — </span>
              <button type="button" className="home-rail-cta" onClick={() => onSelect("movie")}>
                Browse Movies
              </button>
            </div>
          )}
        </section>

        <section className="home-rail" aria-label="Favorites">
          <h2 className="home-rail-title">Favorites</h2>
          {props.favoriteItems && props.favoriteItems.length > 0 ? (
            <div className="home-rail-row">
              {props.favoriteItems.slice(0, 6).map((card) => {
                const saved = props.getPosition?.(card.id);
                const resumable = saved ? isResumableHome(saved.position, saved.duration) : false;
                const pct = resumable && saved ? Math.min(100, Math.max(0, (saved.position / saved.duration) * 100)) : 0;
                return (
                  <button
                    key={card.id}
                    type="button"
                    className="home-rail-card"
                    onClick={() => props.onOpenFavorite?.(card.id)}
                    aria-label={card.name}
                  >
                    <div className="home-rail-thumb">
                      <MediaImage
                        src={card.poster}
                        alt={card.name}
                        className="home-rail-img"
                        placeholderClassName="home-rail-placeholder"
                        fallback={card.name[0] ?? "?"}
                      />
                      {resumable && saved && (
                        <div className="ch-progress home-rail-progress" aria-hidden>
                          <span className="ch-progress-fill" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                    <span className="home-rail-name" title={card.name}>
                      {card.name}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="home-rail-empty">No favorites yet — tap ★</div>
          )}
        </section>
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
                className={`home-footer-exp ${expUrgency === "warn" ? "home-footer-exp--warn" : ""} ${isExpired ? "home-footer-exp--expired" : ""}`}
                title={isTrial ? "Trial account" : isExpired ? "Subscription expired" : undefined}
              >
                {isTrial && <span className="home-footer-trial">Trial · </span>}
                {isExpired ? "Expired" : s.expires} {expDateFormatted}
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
