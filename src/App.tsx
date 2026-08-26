import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useEpg } from "./hooks/useEpg";
import { useHotkeys } from "./hooks/useHotkeys";
import { useProfiles } from "./hooks/useProfiles";
import { usePlaybackResume } from "./hooks/usePlaybackResume";
import { Settings } from "./components/Settings";
import { useAppStore } from "./stores/appStore";
import { getXtreamAccount, type XtreamAccount } from "./lib/xtream";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
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
  const { profiles, activeId, active: activeProfile, ready: profilesReady, create: createProfile, remove: removeProfile, switchTo: switchProfile } = useProfiles();
  const { favoriteIds, toggle } = useFavorites(activeId);
  const { creds: xtreamCreds, save: saveXtreamCreds, clear: clearXtreamCreds } = useXtreamCreds(activeId);
  const { history, record, remove: removeHistory } = useWatchHistory(activeId);
  const { clearPosition } = usePlaybackResume(activeId);

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

  const epgEnabled = sourceKind === "xtream" && contentMode === "live";
  const { getForChannel: getEpgForChannel, fetchShort: fetchEpgShort } = useEpg(xtreamCreds, epgEnabled);
  const activeEpg = active ? getEpgForChannel(active.id) : undefined;

  const [account, setAccount] = useState<XtreamAccount | null>(null);
  useEffect(() => {
    if (sourceKind !== "xtream" || !xtreamCreds) {
      setAccount(null);
      return;
    }
    const ctrl = new AbortController();
    getXtreamAccount(xtreamCreds, tauriFetch as unknown as never, { signal: ctrl.signal })
      .then((a) => {
        if (!ctrl.signal.aborted) setAccount(a);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setAccount(null);
      });
    return () => ctrl.abort();
  }, [sourceKind, xtreamCreds]);

  useEffect(() => {
    if (!active || !epgEnabled) return;
    if (!activeEpg) void fetchEpgShort(active.id);
  }, [active, activeEpg, epgEnabled, fetchEpgShort]);

  // When active profile changes, reconcile playlist with that profile's creds
  useEffect(() => {
    if (!profilesReady || !activeId) return;
    // if new profile has saved creds and no playlist loaded, auto-load it
    if (xtreamCreds && sourceKind === null && !loading) {
      loadFromXtream(xtreamCreds);
      setContentMode("live");
      setScreen("home");
    }
  }, [profilesReady, activeId, xtreamCreds, sourceKind, loading, loadFromXtream, setContentMode, setScreen]);

  const handleSwitchProfile = useCallback(
    async (id: string) => {
      if (id === activeId) return;
      disconnect();
      setActive(null);
      setDetailTarget(null);
      setContentMode("live");
      setSmartFilter("all");
      setCategory(null);
      setSearch("");
      setScreen("home");
      await switchProfile(id);
    },
    [activeId, disconnect, setActive, setCategory, setContentMode, setDetailTarget, setScreen, setSmartFilter, setSearch, switchProfile]
  );

  // Global hotkeys — respects inputs (ignoreInputs)
  useHotkeys(
    {
      "/": () => {
        const el = (document.getElementById("browse-search") as HTMLInputElement | null) ?? (document.getElementById("channel-search") as HTMLInputElement | null);
        el?.focus();
        el?.select();
      },
      Escape: () => {
        if (screen === "watch") setScreen(detailTarget ? "detail" : "browse");
        else if (screen === "detail") backToBrowse();
        else if (screen === "browse") goHome();
        else if (screen === "settings") setScreen("home");
      },
      f: () => {
        // favorite toggle: detail > watch > browse poster (ignore in browse live)
        if (screen === "detail" && detailTarget) {
          const id = detailTarget.kind === "movie" ? detailTarget.channel.id : `series:${detailTarget.series.id}`;
          toggle(id);
        } else if (screen === "watch" && active) {
          // in watch, let PlayerControls handle 'f' for fullscreen — still toggle here if not live? conflict avoided by ignoring watch 'f' for favorite (fullscreen takes priority)
          // no-op in watch to preserve fullscreen on 'f'
        } else if (screen === "browse" && detailTarget) {
          const id = detailTarget.kind === "movie" ? detailTarget.channel.id : `series:${detailTarget.series.id}`;
          toggle(id);
        }
      },
      "1": () => {
        if (screen === "home") enterContent("live");
      },
      "2": () => {
        if (screen === "home") enterContent("movie");
      },
      "3": () => {
        if (screen === "home") enterContent("series");
      },
    },
    { enabled: sourceKind !== null }
  );

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
    clearXtreamCreds();
    setActive(null);
    setDetailTarget(null);
    setContentMode("live");
    setSmartFilter("all");
    setCategory(null);
    setSearch("");
    setScreen("home");
  }, [disconnect, clearXtreamCreds, setActive, setCategory, setContentMode, setDetailTarget, setScreen, setSmartFilter, setSearch]);

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
    },
    [setSmartFilter]
  );

  const handleCategory = useCallback(
    (c: string | null) => {
      setCategory(c);
    },
    [setCategory]
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

  const handleRemoveWatched = useCallback(
    (id: string) => {
      removeHistory(id);
      clearPosition(id);
    },
    [removeHistory, clearPosition]
  );

  const handleClearWatched = useCallback(() => {
    // clear only current contentMode kind
    const ids = history.filter((h) => (contentMode === "movie" ? h.kind === "movie" : h.kind === "episode")).map((h) => h.id);
    ids.forEach((id) => clearPosition(id));
    // batch remove via clear then re-add non-matching is simpler: filter and set
    // use removeHistory per id
    ids.forEach((id) => removeHistory(id));
  }, [history, contentMode, removeHistory, clearPosition]);

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

  if (!profilesReady) {
    return (
      <div className="player-empty">
        <span className="inline-loader" aria-hidden />
        Loading profiles…
      </div>
    );
  }

  if (sourceKind === null) {
    return (
      <LoginPage
        xtreamCreds={xtreamCreds}
        loading={loading}
        error={error}
        onLoadXtream={handleLoadXtream}
        onLoadUrl={handleLoadUrl}
        onLoadFile={handleLoadFile}
        profiles={profiles}
        activeId={activeId}
        onSwitchProfile={handleSwitchProfile}
        onCreateProfile={createProfile}
        onDeleteProfile={removeProfile}
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
        onSettings={() => setScreen("settings")}
        profileName={activeProfile?.name ?? null}
        username={account?.username ?? xtreamCreds?.username ?? null}
        expDateFormatted={account?.expDateFormatted ?? null}
        expTimestamp={account?.expTimestamp ?? null}
        isTrial={account?.isTrial ?? false}
      />
    );
  }

  if (screen === "settings") {
    return (
      <Settings
        profiles={profiles}
        activeId={activeId}
        onSwitch={handleSwitchProfile}
        onCreate={createProfile}
        onDelete={removeProfile}
        onBack={() => setScreen("home")}
        account={account}
        username={xtreamCreds?.username ?? null}
        onDisconnect={handleDisconnect}
      />
    );
  }

  if (screen === "watch" && active) {
    return (
      <WatchView
        channel={active}
        onBack={() => setScreen(detailTarget ? "detail" : "browse")}
        epgNow={activeEpg?.now}
        epgNext={activeEpg?.next}
        profileId={activeId}
      />
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
        profileId={activeId}
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
        profileId={activeId}
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
          getEpgForChannel={getEpgForChannel}
        />
        <main className="main">
          {error && <div className="banner banner-error">{error}</div>}
          {sourceLabel && !error && (
            <div className="banner banner-info">
              Loaded: {sourceLabel} · {channels.length} channels
            </div>
          )}
          <Player channel={active} onBack={goHome} profileId={activeId} />
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
          <div className="browse-header-actions">
            <span className="browse-count">{posterCards.length} items</span>
            {smartFilter === "continue" && posterCards.length > 0 && (
              <button type="button" className="browse-clear" onClick={handleClearWatched}>Clear all</button>
            )}
          </div>
        </header>
        <PosterGrid
          items={posterCards}
          onOpen={handleOpenPoster}
          onRemove={handleRemoveWatched}
          showRemove={smartFilter === "continue"}
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
