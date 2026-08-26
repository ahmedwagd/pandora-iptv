import { useCallback, useMemo } from "react";
import { Sidebar } from "./components/Sidebar";
import { Player } from "./components/Player";
import { LoginPage } from "./components/LoginPage";
import { Home } from "./components/Home";
import { FilterSidebar } from "./components/FilterSidebar";
import { PosterGrid } from "./components/PosterGrid";
import { DetailPage } from "./components/DetailPage";
import { WatchView } from "./components/WatchView";
import { usePlaylist } from "./hooks/usePlaylist";
import { useFavorites } from "./hooks/useFavorites";
import { useXtreamCreds } from "./hooks/useXtreamCreds";
import { useWatchHistory } from "./hooks/useWatchHistory";
import { useAppStore } from "./stores/appStore";
import { selectCategories, selectPosterCards } from "./app/selectors/browseSelectors";
import type { Channel, Series, XtreamCreds } from "./types";
import "./App.css";

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
  const { creds: xtreamCreds, save: saveXtreamCreds, clear: clearXtreamCreds } = useXtreamCreds();
  const { history, record } = useWatchHistory();

  const {
    active,
    contentMode,
    screen,
    detailTarget,
    smartFilter,
    category,
    search,
    setActive,
    setContentMode,
    setScreen,
    setDetailTarget,
    setSmartFilter,
    setCategory,
    setSearch,
  } = useAppStore();

  const handleLoadXtream = useCallback(
    (creds: XtreamCreds, remember: boolean) => {
      if (remember) saveXtreamCreds(creds);
      else clearXtreamCreds();
      setContentMode("live");
      setScreen("home");
      loadFromXtream(creds);
    },
    [saveXtreamCreds, clearXtreamCreds, loadFromXtream, setContentMode, setScreen]
  );

  const handleLoadUrl = useCallback(
    (url: string) => {
      setContentMode("live");
      setScreen("browse");
      loadFromUrl(url);
    },
    [loadFromUrl, setContentMode, setScreen]
  );

  const handleLoadFile = useCallback(() => {
    setContentMode("live");
    setScreen("browse");
    loadFromFile();
  }, [loadFromFile, setContentMode, setScreen]);

  const enterContent = useCallback(
    (mode: typeof contentMode) => {
      setContentMode(mode);
      setSmartFilter("all");
      setCategory(null);
      setSearch("");
      closeSeries();
      setScreen("browse");
    },
    [closeSeries, setContentMode, setSmartFilter, setCategory, setSearch, setScreen]
  );

  const goHome = useCallback(() => {
    setScreen("home");
    setActive(null);
    setDetailTarget(null);
    closeSeries();
  }, [closeSeries, setActive, setDetailTarget, setScreen]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setActive(null);
    setDetailTarget(null);
    setContentMode("live");
    setSmartFilter("all");
    setCategory(null);
    setSearch("");
    setScreen("home");
  }, [disconnect, setActive, setCategory, setContentMode, setDetailTarget, setScreen, setSmartFilter, setSearch]);

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
    [record, setActive, setScreen]
  );

  const openMovieDetail = useCallback(
    (channel: Channel) => {
      setDetailTarget({ kind: "movie", channel });
      loadMovieDetail(channel.id.replace(/^movie:/, ""));
      setScreen("detail");
    },
    [loadMovieDetail, setDetailTarget, setScreen]
  );

  const openSeriesDetail = useCallback(
    (s: Series) => {
      setDetailTarget({ kind: "series", series: s });
      openSeries(s);
      setScreen("detail");
    },
    [openSeries, setDetailTarget, setScreen]
  );

  const backToBrowse = useCallback(() => {
    setDetailTarget(null);
    setScreen("browse");
  }, [setDetailTarget, setScreen]);

  const handleSmartFilter = useCallback(
    (f: typeof smartFilter) => {
      setSmartFilter(f);
      setCategory(null);
    },
    [setCategory, setSmartFilter]
  );

  const handleCategory = useCallback(
    (c: string | null) => {
      setCategory(c);
      setSmartFilter("all");
    },
    [setCategory, setSmartFilter]
  );

  const browseCategories = useMemo(() => {
    if (contentMode === "live") return [];
    return selectCategories(contentMode as "movie" | "series", movies, series);
  }, [contentMode, movies, series]);

  const posterCards = useMemo(
    () =>
      contentMode === "live"
        ? []
        : selectPosterCards({
            contentMode: contentMode as "movie" | "series",
            smartFilter,
            category,
            search,
            movies,
            series,
            history,
            favoriteIds,
          }),
    [contentMode, smartFilter, category, search, movies, series, history, favoriteIds]
  );

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
        onRefresh={() => loadMovieDetail(detailTarget.channel.id.replace(/^movie:/, ""))}
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
        onRefresh={() => openSeries(detailTarget.series)}
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
          onSelect={setActive}
          onToggleFavorite={toggle}
          loading={loading}
          onHome={goHome}
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
        categories={browseCategories}
        category={category}
        onCategory={handleCategory}
        search={search}
        onSearch={setSearch}
        onHome={goHome}
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
              ? "No favorites yet — tap ★ to keep it here."
              : smartFilter === "continue"
                ? "Nothing watched yet — open something and it will show up here."
                : "Nothing here yet."
          }
        />
      </main>
    </div>
  );
}
