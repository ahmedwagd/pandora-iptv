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
import { useEpgEnabled } from "./hooks/useEpgEnabled";
import { useHotkeys } from "./hooks/useHotkeys";
import { useBlockBrowserHotkeys } from "./hooks/useBlockBrowserHotkeys";
import { useOnline } from "./hooks/useOnline";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CommandPalette } from "./components/CommandPalette";
import { useParental } from "./hooks/useParental";
import { useLang } from "./hooks/useLang";
import { strings } from "./i18n";
import { useProfiles } from "./hooks/useProfiles";
import { usePlaybackResume } from "./hooks/usePlaybackResume";
import { Settings } from "./components/Settings";
import { useAppStore } from "./stores/appStore";
import { getXtreamAccount, type XtreamAccount } from "./lib/xtream";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { selectCategories, selectPosterCards, type SortKey } from "./app/selectors/browseSelectors";
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
  const {
    profiles,
    activeId,
    active: activeProfile,
    ready: profilesReady,
    create: createProfile,
    remove: removeProfile,
    switchTo: switchProfile,
  } = useProfiles();
  const { favoriteIds, toggle } = useFavorites(activeId);
  const {
    creds: xtreamCreds,
    save: saveXtreamCreds,
    clear: clearXtreamCreds,
  } = useXtreamCreds(activeId);
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
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const parental = useParental();
  const { lang: appLang } = useLang();
  const appStrings = strings[appLang];
  const [pinAsk, setPinAsk] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");

  useBlockBrowserHotkeys(true);
  const online = useOnline();
  useEffect(() => {
    const onCmd = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
      if (e.key === "?" && !(e.target as HTMLElement)?.matches("input,textarea"))
        setHelpOpen((o) => !o);
    };
    window.addEventListener("keydown", onCmd);
    return () => window.removeEventListener("keydown", onCmd);
  }, []);

  const { enabled: epgPref } = useEpgEnabled();
  const epgEnabled = epgPref && sourceKind === "xtream" && contentMode === "live";
  const { getForChannel: getEpgForChannel, fetchShort: fetchEpgShort, refresh: refreshEpg } =
    useEpg(xtreamCreds, epgEnabled);
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

  // When active profile changes, reconcile playlist with that profile's creds
  useEffect(() => {
    if (!profilesReady || !activeId) return;
    // if new profile has saved creds and no playlist loaded, auto-load it
    if (xtreamCreds && sourceKind === null && !loading) {
      loadFromXtream(xtreamCreds);
      setContentMode("live");
      setScreen("home");
    }
  }, [
    profilesReady,
    activeId,
    xtreamCreds,
    sourceKind,
    loading,
    loadFromXtream,
    setContentMode,
    setScreen,
  ]);

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
    [
      activeId,
      disconnect,
      setActive,
      setCategory,
      setContentMode,
      setDetailTarget,
      setScreen,
      setSmartFilter,
      setSearch,
      switchProfile,
    ]
  );

  // Global hotkeys — respects inputs (ignoreInputs)
  useHotkeys(
    {
      "/": () => {
        const el =
          (document.getElementById("browse-search") as HTMLInputElement | null) ??
          (document.getElementById("channel-search") as HTMLInputElement | null);
        el?.focus();
        el?.select();
      },
      Escape: () => {
        if (screen === "watch") handleExitWatch();
        else if (screen === "detail") backToBrowse();
        else if (screen === "browse") goHome();
        else if (screen === "settings") setScreen("home");
      },
      f: () => {
        // favorite toggle: detail > watch > browse poster (ignore in browse live)
        if (screen === "detail" && detailTarget) {
          const id =
            detailTarget.kind === "movie"
              ? detailTarget.channel.id
              : `series:${detailTarget.series.id}`;
          toggle(id);
        } else if (screen === "watch" && active) {
          // in watch, let PlayerControls handle 'f' for fullscreen — still toggle here if not live? conflict avoided by ignoring watch 'f' for favorite (fullscreen takes priority)
          // no-op in watch to preserve fullscreen on 'f'
        } else if (screen === "browse" && detailTarget) {
          const id =
            detailTarget.kind === "movie"
              ? detailTarget.channel.id
              : `series:${detailTarget.series.id}`;
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
  }, [
    disconnect,
    clearXtreamCreds,
    setActive,
    setCategory,
    setContentMode,
    setDetailTarget,
    setScreen,
    setSmartFilter,
    setSearch,
  ]);

  const watch = useCallback(
    (channel: Channel) => {
      setActive(channel);
      const seriesId = detailTarget?.kind === "series" ? detailTarget.series.id : undefined;
      record({
        id: channel.id,
        name: channel.name,
        poster: channel.logo,
        kind: channel.kind ?? "movie",
        url: channel.url,
        seriesId,
      });
      setScreen("watch");
    },
    [record, setActive, setScreen, detailTarget]
  );

  // Exiting the player returns to the previous screen and forces the EPG
  // guide to refresh so now/next data on the underlying page is current.
  const handleExitWatch = useCallback(() => {
    setScreen(detailTarget ? "detail" : "browse");
    void refreshEpg(true);
  }, [setScreen, detailTarget, refreshEpg]);

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
      if (c && parental.isLocked(c)) {
        if (!parental.pin) {
          setCategory(c);
          return;
        }
        setPinAsk(c);
        return;
      }
      setCategory(c);
    },
    [setCategory, parental]
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
            sortKey,
            movies,
            series,
            history,
            favoriteIds,
          }),
    [contentMode, smartFilter, category, search, sortKey, movies, series, history, favoriteIds]
  );

  const handleTogglePosterFavorite = useCallback(
    (id: string) => {
      if (contentMode === "series") {
        if (smartFilter === "continue") {
          const h = history.find((x) => x.id === id);
          const sid = (h as any)?.seriesId as string | undefined;
          if (sid) {
            toggle(`series:${sid}`);
            return;
          }
          toggle(`series:${id}`);
          return;
        }
        toggle(`series:${id}`);
      } else {
        toggle(id);
      }
    },
    [contentMode, smartFilter, history, series, seasons, toggle]
  );

  const handleRemoveWatched = useCallback(
    (id: string) => {
      removeHistory(id);
      clearPosition(id);
    },
    [removeHistory, clearPosition]
  );

  const [showClearPrompt, setShowClearPrompt] = useState(false);
  const handleClearWatched = useCallback(() => {
    // clear only current contentMode kind
    const ids = history
      .filter((h) => (contentMode === "movie" ? h.kind === "movie" : h.kind === "episode"))
      .map((h) => h.id);
    ids.forEach((id) => clearPosition(id));
    // batch remove via clear then re-add non-matching is simpler: filter and set
    // use removeHistory per id
    ids.forEach((id) => removeHistory(id));
  }, [history, contentMode, removeHistory, clearPosition]);

  const handleOpenPoster = useCallback(
    (id: string) => {
      if (contentMode === "movie") {
        if (smartFilter === "continue") {
          const m = movies.find((x) => x.id === id);
          if (m) openMovieDetail(m);
          else {
            const h = history.find((x) => x.id === id);
            if (h)
              openMovieDetail({
                id: h.id,
                name: h.name,
                url: h.url,
                logo: h.poster,
                group: "Continue watching",
                kind: "movie",
              });
          }
          return;
        }
        const m = movies.find((x) => x.id === id);
        if (m) openMovieDetail(m);
      } else {
        if (smartFilter === "continue") {
          const h = history.find((x) => x.id === id);
          if (h) {
            // try to open parent series detail so user sees Resume button per episode
            const sid = (h as any).seriesId as string | undefined;
            if (sid) {
              const s = series.find((x) => x.id === sid);
              if (s) {
                openSeriesDetail(s);
                return;
              }
            }
            // fallback: try to infer series by searching seasons? if not found, fallback to direct watch
            watch({
              id: h.id,
              name: h.name,
              url: h.url,
              logo: h.poster,
              kind: "episode",
              group: "",
            });
          }
          return;
        }
        const s = series.find((x) => x.id === id);
        if (s) openSeriesDetail(s);
      }
    },
    [contentMode, smartFilter, history, movies, series, watch, openMovieDetail, openSeriesDetail]
  );

  const paletteCommands = useMemo(
    () => [
      { id: "home", label: "Go Home", hint: "Esc", run: () => goHome() },
      { id: "movies", label: "Browse Movies", run: () => enterContent("movie") },
      { id: "series", label: "Browse Series", run: () => enterContent("series") },
      { id: "live", label: "Browse Live", run: () => enterContent("live") },
      {
        id: "favs",
        label: "Show Favorites",
        run: () => {
          setScreen("browse");
          setSmartFilter("favorites");
        },
      },
      {
        id: "continue",
        label: "Continue Watching",
        run: () => {
          setScreen("browse");
          setSmartFilter("continue");
        },
      },
      { id: "settings", label: "Settings", run: () => setScreen("settings") },
      { id: "help", label: "Keyboard Help", run: () => setHelpOpen(true) },
      { id: "disconnect", label: "Disconnect", run: () => handleDisconnect() },
    ],
    [goHome, enterContent, setScreen, setSmartFilter, handleDisconnect]
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
        onBack={handleExitWatch}
        epgNow={activeEpg?.now}
        epgNext={activeEpg?.next}
        onFetchEpg={epgPref ? fetchEpgShort : undefined}
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
          {!online && <div className="banner banner-error">Offline — check your connection.</div>}
          {error && <div className="banner banner-error">{error}</div>}
          {sourceLabel && !error && (
            <div className="banner banner-info">
              Loaded: {sourceLabel} · {channels.length} channels
            </div>
          )}
          <ErrorBoundary><Player channel={active} onBack={goHome} profileId={activeId} /></ErrorBoundary>
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
        {!online && <div className="banner banner-error">Offline — check your connection.</div>}
        <header className="browse-header">
          <h1 className="browse-title">{contentMode === "movie" ? "Movies" : "Series"}</h1>
          <div className="browse-header-actions">
            <label className="browse-sort">
              <span className="browse-sort-label">{appStrings.sort}</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                aria-label="Sort"
              >
                <option value="name-asc">{appStrings.sortAZ}</option>
                <option value="name-desc">{appStrings.sortZA}</option>
                <option value="recent">{appStrings.sortRecent}</option>
              </select>
            </label>
            <span className="browse-count" aria-live="polite">
              {posterCards.length} items
            </span>
            {smartFilter === "continue" && posterCards.length > 0 && (
              <button type="button" className="browse-clear" onClick={()=> setShowClearPrompt(true)}>
                Clear all
              </button>
            )}
          </div>
        </header>
        {cmdOpen && (
          <CommandPalette
            open={cmdOpen}
            onClose={() => setCmdOpen(false)}
            commands={paletteCommands}
            query={cmdQuery}
            onQuery={setCmdQuery}
          />
        )}
        {pinAsk && (
          <div className="cmd-palette-backdrop" onClick={() => setPinAsk(null)}>
            <div
              className="cmd-palette"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: "8px 0" }}>🔒 Locked: {pinAsk}</h3>
              <input
                type="password"
                placeholder="Enter PIN"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (pinInput === parental.pin) {
                      setCategory(pinAsk);
                      setPinAsk(null);
                      setPinInput("");
                    } else {
                      alert("Wrong PIN");
                    }
                  }
                }}
                autoFocus
              />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  className="change-source"
                  onClick={() => {
                    if (pinInput === parental.pin) {
                      setCategory(pinAsk!);
                      setPinAsk(null);
                      setPinInput("");
                    } else alert("Wrong PIN");
                  }}
                >
                  Unlock
                </button>
                <button type="button" className="pc-btn" onClick={() => setPinAsk(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        {showClearPrompt && (
          <div className="cmd-palette-backdrop" style={{alignItems:"center", paddingTop:0}} onClick={() => setShowClearPrompt(false)}>
            <div className="cmd-palette" role="dialog" aria-modal="true" onClick={(e)=> e.stopPropagation()}>
              <h3 style={{margin:"8px 0", fontSize:15, fontWeight:700}}>Clear Continue Watching?</h3>
              <p style={{margin:"0 0 6px", fontSize:13, lineHeight:1.5, opacity:0.85}}>This will remove <strong>{history.filter(h=> (contentMode==="movie"?h.kind==="movie":h.kind==="episode")).length} items</strong> from your Continue Watching and erase saved positions for this profile. This cannot be undone.</p>
              <div style={{display:"flex", gap:8, marginTop:14}}>
                <button type="button" className="settings-logout" style={{flex:1, textAlign:"center", justifyContent:"center"}} onClick={()=> { handleClearWatched(); setShowClearPrompt(false); }}>Clear all</button>
                <button type="button" className="change-source" style={{flex:1}} onClick={()=> setShowClearPrompt(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {helpOpen && (
          <div className="cmd-palette-backdrop" onClick={() => setHelpOpen(false)}>
            <div
              className="cmd-palette"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: "8px 0", fontSize: 14 }}>Keyboard shortcuts</h3>
              <div style={{ fontSize: 12, lineHeight: "1.7", opacity: 0.9 }}>
                / Focus search · Esc Back/Home · 1/2/3 Home tiles · Ctrl+K Palette · ? Help
                <br />
                Player: Space/k Play · m Mute · f Fullscreen · p PiP · z Fit · c Captions · ,/.
                Speed · ←/→ Seek · ↑/↓ Volume
                <br />
                Grid: hover ☆ Favorite · continue ✕ Remove
              </div>
              <button
                type="button"
                className="change-source"
                style={{ marginTop: 10 }}
                onClick={() => setHelpOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        )}
        <ErrorBoundary>
          <PosterGrid
            items={posterCards}
            onOpen={handleOpenPoster}
            onRemove={handleRemoveWatched}
            showRemove={smartFilter === "continue"}
            favoriteIds={favoriteIds}
            onToggleFavorite={handleTogglePosterFavorite}
            emptyText={
              smartFilter === "favorites"
                ? "No favorites yet — tap ★ to keep it here."
                : smartFilter === "continue"
                  ? "Nothing watched yet — open something and it will show up here."
                  : "Nothing here yet."
            }
          />
        </ErrorBoundary>
      </main>
    </div>
  );
}
