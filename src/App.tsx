import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Player } from "./components/Player";
import { usePlaylist } from "./hooks/usePlaylist";
import { useFavorites } from "./hooks/useFavorites";
import type { Channel } from "./types";
import "./App.css";

export default function App() {
  const { channels, loading, error, sourceLabel, loadFromUrl, loadFromFile } = usePlaylist();
  const { favoriteIds, toggleFavorite } = useFavorites();
  const [active, setActive] = useState<Channel | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  return (
    <div className="app">
      <Sidebar
        channels={channels}
        activeId={active?.id ?? null}
        favoriteIds={favoriteIds}
        showFavoritesOnly={showFavoritesOnly}
        onToggleShowFavorites={() => setShowFavoritesOnly((v) => !v)}
        onSelect={setActive}
        onToggleFavorite={toggleFavorite}
        onLoadUrl={loadFromUrl}
        onLoadFile={loadFromFile}
        loading={loading}
      />
      <main className="main">
        {error && <div className="banner banner-error">{error}</div>}
        {sourceLabel && !error && (
          <div className="banner banner-info">
            Loaded: {sourceLabel} · {channels.length} channels
          </div>
        )}
        <Player channel={active} />
      </main>
    </div>
  );
}
