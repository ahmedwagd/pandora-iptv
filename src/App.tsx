import { useCallback, useMemo, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Player } from "./components/Player";
import { LoginPage } from "./components/LoginPage";
import { Home } from "./components/Home";
import { FilterSidebar, type SmartFilter } from "./components/FilterSidebar";
import { PosterGrid, type PosterCard } from "./components/PosterGrid";
import { DetailPage } from "./components/DetailPage";
import { WatchView } from "./components/WatchView";
import { usePlaylist } from "./hooks/usePlaylist";
import { useFavorites } from "./hooks/useFavorites";
import { useXtreamCreds } from "./hooks/useXtreamCreds";
import { useWatchHistory } from "./hooks/useWatchHistory";
import type { Channel, ContentMode, Series, XtreamCreds } from "./types";
import "./App.css";

type Screen = "home" | "browse" | "detail" | "watch";
type DetailTarget =
  | { kind: "movie"; channel: Channel }
  | { kind: "series"; series: Series };

export default function App() {
  const {
    channels,
    movies,
    series,
    seasons,
    movieDetail,
    movieDetailLoading,
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
    loadMovieDetail,
    disconnect,
  } = usePlaylist();
  const { favoriteIds, toggle } = useFavorites();
  const { creds: xtreamCreds, save: saveXtreamCreds } = useXtreamCreds();
  const { history, record } = useWatchHistory();

  const [active, setActive] = useState<Channel | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [contentMode, setContentMode] = useState<ContentMode>("live");
  const [screen, setScreen] = useState<Screen>("home");
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [smartFilter, setSmartFilter] = useState<SmartFilter>("all");
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

  const enterContent = useCallback(
    (mode: ContentMode) => {
      setContentMode(mode);
      setSmartFilter("all");
      setCategory(null);
      setSearch("");
      closeSeries();
      setScreen("browse");
    },
    [closeSeries]
  );

  const goHome = useCallback(() => {
    setScreen("home");
    setActive(null);
    setDetailTarget(null);
    closeSeries();
  }, [closeSeries]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setActive(null);
    setDetailTarget(null);
    setShowFavoritesOnly(false);
    setContentMode("live");
    setSmartFilter("all");
    setCategory(null);
    setSearch("");
    setScreen("home");
  }, [disconnect]);

  const watch = useCallback(
    (channel: Channel) => {
      setActive(channel);
      record({
        id: channel.id,
        name: channel.name,
        poster: channel.logo,
        kind: channel.kind ?? "movie",
        url: channel.url,
      });
      setScreen("watch");
    },
    [record]
  );

  const openMovieDetail = useCallback(
    (channel: Channel) => {
      setDetailTarget({ kind: "movie", channel });
      loadMovieDetail(channel.id.replace(/^movie:/, ""));
      setScreen("detail");
    },
    [loadMovieDetail]
  );

  const openSeriesDetail = useCallback(
    (series: Series) => {
      setDetailTarget({ kind: "series", series });
      openSeries(series);
      setScreen("detail");
    },
    [openSeries]
  );

  const backToBrowse = useCallback(() => {
    setDetailTarget(null);
    setScreen("browse");
  }, []);

  const handleSmartFilter = useCallback((f: SmartFilter) => {
    setSmartFilter(f);
    setCategory(null);
  }, []);

  const handleCategory = useCallback((c: string | null) => {
    setCategory(c);
    setSmartFilter("all");
  }, []);

  const categories = useMemo(() => {
    const list = contentMode === "movie" ? movies.map((m) => m.group) : series.map((s) => s.group);
    const set = new Set<string>();
    list.forEach((g) => set.add(g));
    return Array.from(set);
  }, [contentMode, movies, series]);

  const posterCards = useMemo((): PosterCard[] => {
    const term = search.trim().toLowerCase();
    if (contentMode === "movie") {
      if (smartFilter === "continue") {
        return history
          .filter((h) => h.kind === "movie")
          .map((h) => ({ id: h.id, name: h.name, poster: h.poster }));
      }
      let list = smartFilter === "favorites" ? movies.filter((m) => favoriteIds.has(m.id)) : movies;
      if (category) list = list.filter((m) => m.group === category);
      if (term) list = list.filter((m) => m.name.toLowerCase().includes(term));
      return list.map((m) => ({ id: m.id, name: m.name, poster: m.logo }));
    }
    if (smartFilter === "continue") {
      return history
        .filter((h) => h.kind === "episode")
        .map((h) => ({ id: h.id, name: h.name, poster: h.poster }));
    }
    let list = series;
    if (smartFilter === "favorites") {
      list = series.filter((s) => favoriteIds.has(`series:${s.id}`));
    }
    if (category) list = list.filter((s) => s.group === category);
    if (term) list = list.filter((s) => s.name.toLowerCase().includes(term));
    return list.map((s) => ({ id: s.id, name: s.name, poster: s.cover }));
  }, [contentMode, smartFilter, category, search, movies, series, history, favoriteIds]);

  const handleOpenPoster = useCallback(
    (id: string) => {
      if (contentMode === "movie") {
        if (smartFilter === "continue") {
          const h = history.find((x) => x.id === id);
          if (h) {
            watch({ id: h.id, name: h.name, url: h.url, logo: h.poster, kind: "movie", group: "Continue watching" });
          }
          return;
        }
        const m = movies.find((x) => x.id === id);
        if (m) openMovieDetail(m);
      } else {
        if (smartFilter === "continue") {
          const h = history.find((x) => x.id === id);
          if (h) {
            watch({ id: h.id, name: h.name, url: h.url, logo: h.poster, kind: "episode", group: "" });
          }
          return;
        }
        const s = series.find((x) => x.id === id);
        if (s) openSeriesDetail(s);
      }
    },
    [contentMode, smartFilter, history, movies, series, watch, openMovieDetail, openSeriesDetail]
  );

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

  if (screen === "watch" && active) {
    return (
      <WatchView channel={active} onBack={() => setScreen(detailTarget ? "detail" : "browse")} />
    );
  }

  if (screen === "detail" && detailTarget) {
    return detailTarget.kind === "movie" ? (
      <DetailPage
        kind="movie"
        channel={detailTarget.channel}
        detail={movieDetail}
        detailLoading={movieDetailLoading}
        onBack={backToBrowse}
        onWatch={watch}
        favoriteIds={favoriteIds}
        onToggleFavorite={toggle}
      />
    ) : (
      <DetailPage
        kind="series"
        series={detailTarget.series}
        seasons={seasons}
        episodesLoading={episodesLoading}
        onBack={backToBrowse}
        onWatch={watch}
        favoriteIds={favoriteIds}
        onToggleFavorite={toggle}
      />
    );
  }

  if (contentMode === "live") {
    return (
      <div className="app">
        <Sidebar
          channels={channels}
          activeId={active?.id ?? null}
          favoriteIds={favoriteIds}
          showFavoritesOnly={showFavoritesOnly}
          onToggleShowFavorites={() => setShowFavoritesOnly((v) => !v)}
          onSelect={setActive}
          onToggleFavorite={toggle}
          loading={loading}
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

  return (
    <div className="app">
      <FilterSidebar
        smartFilter={smartFilter}
        onSmartFilter={handleSmartFilter}
        showFavorites
        categories={categories}
        category={category}
        onCategory={handleCategory}
        search={search}
        onSearch={setSearch}
        onHome={goHome}
        onDisconnect={handleDisconnect}
      />
      <main className="browse-main">
        <header className="browse-header">
          <h1 className="browse-title">
            {contentMode === "movie" ? "Movies" : "Series"}
          </h1>
          <span className="browse-count">{posterCards.length} items</span>
        </header>
        <PosterGrid
          items={posterCards}
          onOpen={handleOpenPoster}
          emptyText={
            smartFilter === "favorites"
              ? "No favorites here yet — tap ★ on a movie to keep it."
              : smartFilter === "continue"
                ? "Nothing watched yet. Open something and it will show up here."
                : "Nothing here yet."
          }
        />
      </main>
    </div>
  );
}
