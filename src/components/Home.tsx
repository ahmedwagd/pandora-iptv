import type { ContentMode } from "../types";
import { ColorBar } from "./ColorBar";

interface HomeProps {
  liveCount: number;
  movieCount: number;
  seriesCount: number;
  moviesLoading: boolean;
  seriesLoading: boolean;
  sourceLabel: string | null;
  onSelect: (mode: ContentMode) => void;
  onDisconnect: () => void;
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
  const { sourceLabel, onSelect, onDisconnect } = props;
  const total = props.liveCount + props.movieCount + props.seriesCount;

  return (
    <div className="home">
      <header className="home-header">
        <div className="home-header-block">
          <div className="home-header-top">
            <h1 className="home-title">Library</h1>
            <span className="home-signal">
              <span className="signal-dot" aria-hidden>
                ●
              </span>{" "}
              {total.toLocaleString()} titles · {props.liveCount} on air
            </span>
          </div>
          {sourceLabel && <p className="home-subtitle">{sourceLabel}</p>}
        </div>
        <button className="home-logout" onClick={onDisconnect}>
          Exit
        </button>
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
    </div>
  );
}
