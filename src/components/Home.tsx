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
  icon: React.ReactNode;
}[] = [
  {
    mode: "live",
    label: "Live TV",
    unit: "channels",
    count: (p) => p.liveCount,
    loading: () => false,
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

  return (
    <div className="home">
      <header className="home-header">
        <div>
          <h1 className="home-title">Library</h1>
          {sourceLabel && <p className="home-subtitle">{sourceLabel}</p>}
        </div>
        <button className="home-logout" onClick={onDisconnect}>
          Change source
        </button>
      </header>

      <div className="home-grid">
        {TILES.map((t) => (
          <button key={t.mode} className="home-tile" onClick={() => onSelect(t.mode)}>
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
