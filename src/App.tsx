import { useCallback, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Player } from "./components/Player";
import { LoginPage } from "./components/LoginPage";
import { Home } from "./components/Home";
import { usePlaylist } from "./hooks/usePlaylist";
import { useFavorites } from "./hooks/useFavorites";
import { useXtreamCreds } from "./hooks/useXtreamCreds";
import type { Channel, ContentMode, XtreamCreds } from "./types";
import "./App.css";

type Screen = "home" | "browse";

export default function App() {
  const {
    channels,
    movies,
    series,
    activeSeries,
    seasons,
    loading,
    moviesLoading,
    seriesLoading,
    episodesLoading,
    error,
    sourceLabel,
    sourceKind,
    loadFromUrl,
    loadFromFile,
    loadFromXtream,
    openSeries,
    closeSeries,
    disconnect,
  } = usePlaylist();
  const { favoriteIds, toggleFavorite } = useFavorites();
  const { creds: xtreamCreds, save: saveXtreamCreds } = useXtreamCreds();
  const [active, setActive] = useState<Channel | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [contentMode, setContentMode] = useState<ContentMode>("live");
  const [screen, setScreen] = useState<Screen>("home");

  const handleLoadXtream = useCallback(
    (creds: XtreamCreds) => {
      saveXtreamCreds(creds);
      setContentMode("live");
      setScreen("home");
      loadFromXtream(creds);
    },
    [saveXtreamCreds, loadFromXtream]
  );

  const handleLoadUrl = useCallback(
    (url: string) => {
      setContentMode("live");
      setScreen("browse");
      loadFromUrl(url);
    },
    [loadFromUrl]
  );

  const handleLoadFile = useCallback(() => {
    setContentMode("live");
    setScreen("browse");
    loadFromFile();
  }, [loadFromFile]);

  const handleContentModeChange = useCallback(
    (mode: ContentMode) => {
      setContentMode(mode);
      if (mode !== "series") closeSeries();
    },
    [closeSeries]
  );

  const enterContent = useCallback((mode: ContentMode) => {
    setContentMode(mode);
    closeSeries();
    setScreen("browse");
  }, [closeSeries]);

  const goHome = useCallback(() => {
    setScreen("home");
    setActive(null);
    closeSeries();
  }, [closeSeries]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setActive(null);
    setShowFavoritesOnly(false);
    setContentMode("live");
    setScreen("home");
  }, [disconnect]);

  if (sourceKind === null) {
    return (
      <LoginPage
        xtreamCreds={xtreamCreds}
        loading={loading}
        error={error}
        onLoadXtream={handleLoadXtream}
        onLoadUrl={handleLoadUrl}
        onLoadFile={handleLoadFile}
      />
    );
  }

  if (screen === "home") {
    return (
      <Home
        liveCount={channels.length}
        movieCount={movies.length}
        seriesCount={series.length}
        moviesLoading={moviesLoading}
        seriesLoading={seriesLoading}
        sourceLabel={sourceLabel}
        onSelect={enterContent}
        onDisconnect={handleDisconnect}
      />
    );
  }

  return (
    <div className="app">
      <Sidebar
        channels={channels}
        movies={movies}
        series={series}
        activeSeries={activeSeries}
        seasons={seasons}
        activeId={active?.id ?? null}
        favoriteIds={favoriteIds}
        showFavoritesOnly={showFavoritesOnly}
        onToggleShowFavorites={() => setShowFavoritesOnly((v) => !v)}
        onSelect={setActive}
        onToggleFavorite={toggleFavorite}
        loading={loading}
        episodesLoading={episodesLoading}
        sourceKind={sourceKind}
        contentMode={contentMode}
        onContentModeChange={handleContentModeChange}
        onOpenSeries={openSeries}
        onCloseSeries={closeSeries}
        onHome={goHome}
        onDisconnect={handleDisconnect}
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
