import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Player } from "./components/Player";
import { LoginPage } from "./components/LoginPage";
import { Home } from "./components/Home";
import { FilterSidebar } from "./components/FilterSidebar";
import { PosterGrid, PosterGridSkeleton } from "./components/PosterGrid";
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
import { useFocusTrap } from "./hooks/useFocusTrap";
import { useOnline } from "./hooks/useOnline";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { GlobalSearch } from "./components/GlobalSearch";
import { useRecentSearches } from "./hooks/useRecentSearches";
import { buildSearchIndex, rankResults } from "./lib/searchIndex";
import { useParental } from "./hooks/useParental";
import { useLang } from "./hooks/useLang";
import { strings } from "./i18n";
import { useProfiles } from "./hooks/useProfiles";
import { usePlaybackResume } from "./hooks/usePlaybackResume";
import { Settings } from "./components/Settings";
import { useAppStore, type Screen } from "./stores/appStore";
import { getXtreamAccount, type XtreamAccount } from "./lib/xtream";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { selectCategories, selectPosterCards, type SortKey } from "./app/selectors/browseSelectors";
import { useUpdater } from "./hooks/useUpdater";
import { UpdateBanner } from "./components/UpdateBanner";
import { ColorBar } from "./components/ColorBar";
import { SplashScreen } from "./components/SplashScreen";
import type { Channel, Series, XtreamCreds, ContentMode } from "./types";
import "./App.css";

function isResumableApp(pos: number, dur: number): boolean {
  if (!Number.isFinite(pos) || !Number.isFinite(dur) || dur <= 0) return false;
  if (pos < 10) return false;
  if (dur - pos < 15) return false;
  const pct = pos / dur;
  return pct > 0.01 && pct < 0.985;
}

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
    ready: xtreamReady,
  } = useXtreamCreds(activeId);
  const { history, record, remove: removeHistory } = useWatchHistory(activeId);
  const { positions: playbackPositions, getPosition, clearPosition } = usePlaybackResume(activeId);

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
    enterContent: storeEnterContent,
    goHome: storeGoHome,
    handleDisconnect: storeHandleDisconnect,
  } = useAppStore();
  const hydrateBrowseFilters = useAppStore((s) => s.hydrateBrowseFilters);
  const persistBrowseFilters = useAppStore((s) => s.persistBrowseFilters);
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const parental = useParental();
  const { lang: appLang } = useLang();
  const appStrings = strings[appLang];
  const [pinAsk, setPinAsk] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [showClearPrompt, setShowClearPrompt] = useState(false);
  const updater = useUpdater({ notify: true, autoCheck: true });
  const [settingsInitialGroup, setSettingsInitialGroup] = useState<"profiles" | "account" | "appearance" | "epg" | "playback" | "video" | "parental" | "updates" | undefined>(undefined);
  const [settingsReturn, setSettingsReturn] = useState<Screen | null>(null);
  const pushScreen = useAppStore((s) => s.pushScreen);
  const popScreen = useAppStore((s) => s.popScreen);
  const handleViewUpdate = useCallback(() => {
    setSettingsInitialGroup("updates");
    setSettingsReturn(screen);
    pushScreen("settings");
  }, [screen, pushScreen]);
  const handleOpenSettings = useCallback(() => {
    setSettingsInitialGroup(undefined);
    setSettingsReturn(screen);
    pushScreen("settings");
  }, [screen, pushScreen]);
  const handleCloseSettings = useCallback(() => {
    const st = useAppStore.getState();
    if (st.screenHistory.length > 0 || st.prevScreen) {
      popScreen();
    } else if (settingsReturn) {
      setScreen(settingsReturn);
    } else {
      setScreen("home");
    }
    setSettingsReturn(null);
    setSettingsInitialGroup(undefined);
  }, [settingsReturn, popScreen, setScreen]);

  const pinDialogRef = useRef<HTMLDivElement>(null);
  const clearDialogRef = useRef<HTMLDivElement>(null);
  const helpDialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(!!pinAsk, () => { setPinAsk(null); setPinError(null); }, pinDialogRef);
  useFocusTrap(showClearPrompt, () => setShowClearPrompt(false), clearDialogRef);
  useFocusTrap(helpOpen, () => setHelpOpen(false), helpDialogRef);

  // Splash — 300ms overlay, waits for profiles/creds so remember-me can
  // auto-login before reveal (no login flash). If creds exist, waits for
  // sourceKind to resolve (auto-login fetch). Safety max 3s.
  const isTestEnv = (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE === "test";
  const [splashVisible, setSplashVisible] = useState(() => !isTestEnv);
  const [splashFading, setSplashFading] = useState(false);

  useEffect(() => {
    if (isTestEnv || !splashVisible || splashFading) return;
    if (!profilesReady || !xtreamReady) return;
    if (xtreamCreds && sourceKind === null) return; // auto-login pending
    const showId = window.setTimeout(() => setSplashFading(true), 200);
    return () => window.clearTimeout(showId);
  }, [isTestEnv, splashVisible, splashFading, profilesReady, xtreamReady, xtreamCreds, sourceKind]);

  useEffect(() => {
    if (!splashFading) return;
    const hideId = window.setTimeout(() => setSplashVisible(false), 100);
    return () => window.clearTimeout(hideId);
  }, [splashFading]);

  // Ultimate safety: never stay stuck more than 3s even if store hangs
  useEffect(() => {
    if (isTestEnv || !splashVisible) return;
    const killId = window.setTimeout(() => {
      setSplashFading(true);
      window.setTimeout(() => setSplashVisible(false), 100);
    }, 3000);
    return () => window.clearTimeout(killId);
  }, [isTestEnv, splashVisible]);

  const splashOverlay = splashVisible ? <SplashScreen fading={splashFading} /> : null;

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
  const {
    getForChannel: getEpgForChannel,
    fetchShort: fetchEpgShort,
    refresh: refreshEpg,
    loading: epgLoading,
  } = useEpg(xtreamCreds, epgEnabled);
  const isLiveLoading = loading || epgLoading;
  const isBrowseLoading = contentMode === "movie" ? moviesLoading : contentMode === "series" ? seriesLoading : false;
  const activeEpg = active ? getEpgForChannel(active.id) : undefined;
  const { recent: recentSearches, push: pushRecent, clear: clearRecent } = useRecentSearches(activeId);
  const searchIndex = useMemo(() => buildSearchIndex({ channels, movies, series }), [channels, movies, series]);
  const globalResults = useMemo(() => rankResults(searchIndex, cmdQuery, { getEpgForChannel }), [searchIndex, cmdQuery, getEpgForChannel]);

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
    if (!profilesReady || !activeId || !xtreamReady) return;
    // if new profile has saved creds and no playlist loaded, auto-load it
    if (xtreamCreds && sourceKind === null && !loading) {
      loadFromXtream(xtreamCreds);
      setContentMode("live");
      setScreen("home");
    }
  }, [
    profilesReady,
    activeId,
    xtreamReady,
    xtreamCreds,
    sourceKind,
    loading,
    loadFromXtream,
    setContentMode,
    setScreen,
  ]);

  // 0.8 Persist browse filters per profile+contentMode
  const browseHydratedRef = useRef<Set<string>>(new Set());
  const prevBrowseModeRef = useRef<ContentMode | null>(null);
  useEffect(() => {
    if (!profilesReady || !activeId) return;
    if (contentMode === "live") return;
    const key = `${activeId}:${contentMode}`;
    void hydrateBrowseFilters(activeId, contentMode as "movie" | "series").finally(() => {
      browseHydratedRef.current.add(key);
      prevBrowseModeRef.current = contentMode;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilesReady, activeId, contentMode]);

  useEffect(() => {
    if (!activeId) return;
    if (contentMode === "live") return;
    const key = `${activeId}:${contentMode}`;
    if (!browseHydratedRef.current.has(key)) return;
    // skip persist when contentMode just changed — hydrate will restore correct filters
    if (prevBrowseModeRef.current !== contentMode) {
      prevBrowseModeRef.current = contentMode;
      return;
    }
    persistBrowseFilters(activeId, contentMode);
  }, [activeId, contentMode, smartFilter, category, search, persistBrowseFilters]);

  const handleSwitchProfile = useCallback(
    async (id: string) => {
      if (id === activeId) return;
      // prevent persist of reset defaults overwriting old profile's saved filters
      if (activeId) {
        browseHydratedRef.current.delete(`${activeId}:movie`);
        browseHydratedRef.current.delete(`${activeId}:series`);
      }
      disconnect();
      setActive(null);
      setDetailTarget(null);
      setContentMode("live");
      setSmartFilter("all");
      setCategory(null);
      setSearch("");
      useAppStore.setState({ screenHistory: [], prevScreen: null });
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
        if (cmdOpen || helpOpen || pinAsk || showClearPrompt) return;
        if (screen === "watch") handleExitWatch();
        else if (screen === "detail") backToBrowse();
        else if (screen === "browse") goHome();
        else if (screen === "settings") handleCloseSettings();
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
    async (creds: XtreamCreds, remember: boolean) => {
      if (remember) await saveXtreamCreds(creds);
      else await clearXtreamCreds();
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
      closeSeries();
      storeEnterContent(mode);
    },
    [closeSeries, storeEnterContent]
  );

  const goHome = useCallback(() => {
    closeSeries();
    storeGoHome();
  }, [closeSeries, storeGoHome]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    clearXtreamCreds();
    storeHandleDisconnect();
  }, [disconnect, clearXtreamCreds, storeHandleDisconnect]);

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
      pushScreen("watch");
    },
    [record, setActive, pushScreen, detailTarget]
  );

  // Exiting the player returns to the previous screen and forces the EPG
  // guide to refresh so now/next data on the underlying page is current.
  const handleExitWatch = useCallback(() => {
    const st = useAppStore.getState();
    if (st.screenHistory.length > 0 || st.prevScreen) {
      popScreen();
    } else {
      setScreen(detailTarget ? "detail" : "browse");
    }
    void refreshEpg(true);
  }, [detailTarget, popScreen, setScreen, refreshEpg]);

  const openMovieDetail = useCallback(
    (channel: Channel) => {
      setDetailTarget({ kind: "movie", channel });
      loadMovieDetail(channel.id.replace(/^movie:/, ""));
      pushScreen("detail");
    },
    [loadMovieDetail, setDetailTarget, pushScreen]
  );

  const openSeriesDetail = useCallback(
    (s: Series) => {
      setDetailTarget({ kind: "series", series: s });
      openSeries(s);
      pushScreen("detail");
    },
    [openSeries, setDetailTarget, pushScreen]
  );

  const backToBrowse = useCallback(() => {
    setDetailTarget(null);
    const st = useAppStore.getState();
    if (st.screenHistory.length > 0 || st.prevScreen) {
      popScreen();
    } else {
      setScreen("browse");
    }
  }, [setDetailTarget, popScreen, setScreen]);

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
        setPinError(null);
        setPinInput("");
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

  const continueCards = useMemo(() => {
    void playbackPositions;
    const filtered = history.filter((h) => {
      const pos = getPosition(h.id) ?? (h.position !== undefined && h.duration !== undefined ? { position: h.position, duration: h.duration } : undefined);
      if (!pos) return false;
      return isResumableApp(pos.position, pos.duration);
    });
    return filtered.slice(0, 3).map((h) => ({ id: h.id, name: h.name, poster: h.poster }));
  }, [history, getPosition, playbackPositions]);

  const favoriteCards = useMemo(() => {
    const movieFav = movies.filter((m) => favoriteIds.has(m.id)).map((m) => ({ id: m.id, name: m.name, poster: m.logo }));
    const seriesFav = series.filter((s) => favoriteIds.has(`series:${s.id}`)).map((s) => ({ id: s.id, name: s.name, poster: s.cover }));
    return [...movieFav, ...seriesFav].slice(0, 6);
  }, [movies, series, favoriteIds]);

  const handleOpenContinueCard = useCallback(
    (id: string) => {
      const h = history.find((x) => x.id === id);
      if (h?.kind === "movie") {
        const m = movies.find((x) => x.id === id);
        if (m) { openMovieDetail(m); return; }
        if (h) openMovieDetail({ id: h.id, name: h.name, url: h.url, logo: h.poster, group: "Continue watching", kind: "movie" });
        return;
      }
      if (h?.kind === "episode") {
        const sid = (h as unknown as { seriesId?: string }).seriesId;
        if (sid) {
          const s = series.find((x) => x.id === sid);
          if (s) { openSeriesDetail(s); return; }
        }
        watch({ id: h.id, name: h.name, url: h.url, logo: h.poster, kind: "episode", group: "" });
        return;
      }
      const m = movies.find((x) => x.id === id);
      if (m) { openMovieDetail(m); return; }
      const s = series.find((x) => x.id === id);
      if (s) openSeriesDetail(s);
    },
    [history, movies, series, watch, openMovieDetail, openSeriesDetail]
  );

  const handleOpenFavoriteCard = useCallback(
    (id: string) => {
      const m = movies.find((x) => x.id === id);
      if (m) { openMovieDetail(m); return; }
      const s = series.find((x) => x.id === id);
      if (s) openSeriesDetail(s);
    },
    [movies, series, openMovieDetail, openSeriesDetail]
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

  const handleClearWatched = useCallback(() => {
    const ids = history
      .filter((h) => (contentMode === "movie" ? h.kind === "movie" : h.kind === "episode"))
      .map((h) => h.id);
    ids.forEach((id) => clearPosition(id));
    ids.forEach((id) => removeHistory(id));
  }, [history, contentMode, removeHistory, clearPosition]);

  const handleRetry = useCallback(() => {
    if (xtreamCreds) {
      loadFromXtream(xtreamCreds);
    } else if (sourceKind === "m3u" && sourceLabel?.startsWith("http")) {
      loadFromUrl(sourceLabel);
    } else if (sourceKind === "m3u") {
      void loadFromFile();
    } else if (sourceLabel?.startsWith("http")) {
      loadFromUrl(sourceLabel);
    }
  }, [xtreamCreds, sourceKind, sourceLabel, loadFromXtream, loadFromUrl, loadFromFile]);

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

  // 1.6 — Compute next episode for auto-next countdown in Player
  // When active is an episode, find its index in the flattened seasons list
  // (seasons corresponds to currently opened series detail). If not found,
  // fallback to null (no auto-next). History record already handles seriesId.
  const nextChannel = useMemo(() => {
    if (!active || active.kind !== "episode") return null;
    if (seasons.length === 0) return null;
    const flat = seasons.flatMap((s) => s.episodes);
    const idx = flat.findIndex((e) => e.id === active.id);
    if (idx === -1 || idx + 1 >= flat.length) return null;
    return flat[idx + 1] ?? null;
  }, [active, seasons]);

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
      { id: "settings", label: "Settings", run: () => handleOpenSettings() },
      { id: "help", label: "Keyboard Help", run: () => setHelpOpen(true) },
      { id: "disconnect", label: "Disconnect", run: () => handleDisconnect() },
    ],
    [goHome, enterContent, handleOpenSettings, setSmartFilter, handleDisconnect]
  );

  const handleGlobalSelect = useCallback((item: { kind: string; original: Channel | Series; name: string }) => {
    const q = cmdQuery.trim() || item.name;
    if (q) pushRecent(q);
    if (item.kind === "live") {
      setContentMode("live");
      setScreen("browse");
      setSmartFilter("all");
      setCategory(null);
      setSearch("");
      setActive(item.original as Channel);
    } else if (item.kind === "movie") {
      openMovieDetail(item.original as Channel);
    } else {
      openSeriesDetail(item.original as Series);
    }
    setCmdOpen(false);
  }, [cmdQuery, pushRecent, setContentMode, setScreen, setSmartFilter, setCategory, setSearch, setActive, openMovieDetail, openSeriesDetail]);

  const globalSearchOverlay = cmdOpen ? (
    <GlobalSearch
      open={cmdOpen}
      onClose={() => setCmdOpen(false)}
      query={cmdQuery}
      onQuery={setCmdQuery}
      recent={recentSearches}
      onRecentClick={(t) => setCmdQuery(t)}
      onClearRecent={clearRecent}
      results={globalResults as any}
      onSelect={handleGlobalSelect as any}
      commands={paletteCommands}
    />
  ) : null;

  if (!profilesReady) {
    return (
      <>
        <div className="player-empty">
          <span className="inline-loader" aria-hidden />
          Loading profiles…
        </div>
        {splashOverlay}
      </>
    );
  }

  if (sourceKind === null) {
    return (
      <>
        <LoginPage
          xtreamCreds={xtreamCreds}
          credsReady={xtreamReady}
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
        {splashOverlay}
      </>
    );
  }

  if (screen === "home") {
    return (
      <>
      <UpdateBanner updater={updater} onView={handleViewUpdate} />
      <Home
        liveCount={channels.length}
        movieCount={movies.length}
        seriesCount={series.length}
        moviesLoading={moviesLoading}
        seriesLoading={seriesLoading}
        sourceLabel={sourceLabel}
        onSelect={enterContent}
        onDisconnect={handleDisconnect}
        onSettings={handleOpenSettings}
        profileName={activeProfile?.name ?? null}
        username={account?.username ?? xtreamCreds?.username ?? null}
        expDateFormatted={account?.expDateFormatted ?? null}
        expTimestamp={account?.expTimestamp ?? null}
        isTrial={account?.isTrial ?? false}
        continueItems={continueCards}
        favoriteItems={favoriteCards}
        onOpenContinue={handleOpenContinueCard}
        onOpenFavorite={handleOpenFavoriteCard}
        onSearchOpen={() => setCmdOpen(true)}
        onHelpOpen={() => setHelpOpen(true)}
        getPosition={getPosition}
      />
      {globalSearchOverlay}
      {helpOpen && (
        <div className="cmd-palette-backdrop" onClick={() => setHelpOpen(false)}>
          <div ref={helpDialogRef} className="cmd-palette" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "8px 0", fontSize: 14 }}>Keyboard shortcuts</h3>
            <div style={{ fontSize: 12, lineHeight: "1.7", opacity: 0.9 }}>
              / Focus search · Esc Back/Home · 1/2/3 Home tiles · Ctrl+K Palette · ? Help
              <br />
              Player: Space/k Play · m Mute · f Fullscreen · p PiP · z Fit · c Captions · ,/. Speed · ←/→ Seek · ↑/↓ Volume
              <br />
              Grid: hover ☆ Favorite · continue ✕ Remove
            </div>
            <button type="button" className="change-source" style={{ marginTop: 10 }} onClick={() => setHelpOpen(false)}>Close</button>
          </div>
        </div>
      )}
      {splashOverlay}
      </>
    );
  }

  if (screen === "settings") {
    return (
      <>
      <Settings
        updater={updater}
        initialGroup={settingsInitialGroup}
        profiles={profiles}
        activeId={activeId}
        onSwitch={handleSwitchProfile}
        onCreate={createProfile}
        onDelete={removeProfile}
        onBack={handleCloseSettings}
        account={account}
        username={xtreamCreds?.username ?? null}
        onDisconnect={handleDisconnect}
      />
      {globalSearchOverlay}
      {splashOverlay}
      </>
    );
  }

  if (screen === "watch" && active) {
    return (
      <>
      <UpdateBanner updater={updater} onView={handleViewUpdate} />
      <WatchView
        channel={active}
        onBack={handleExitWatch}
        epgNow={activeEpg?.now}
        epgNext={activeEpg?.next}
        onFetchEpg={epgPref ? fetchEpgShort : undefined}
        profileId={activeId}
        zapList={channels}
        onZap={setActive}
        getEpgForChannel={getEpgForChannel}
        nextChannel={nextChannel}
        onNext={watch}
      />
      {globalSearchOverlay}
      {splashOverlay}
      </>
    );
  }

  if (screen === "detail" && detailTarget) {
    return (
      <>
      <UpdateBanner updater={updater} onView={handleViewUpdate} />
      {detailTarget.kind === "movie" ? (
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
      )}
      {globalSearchOverlay}
      {splashOverlay}
      </>
    );
  }

  if (contentMode === "live") {
    return (
      <>
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
          epgLoading={epgLoading}
          onSearchOpen={() => setCmdOpen(true)}
          onHelpOpen={() => setHelpOpen(true)}
          profileId={activeId}
        />
        <main className="main">
          {isLiveLoading && <ColorBar className="colorbar--loading" />}
          <UpdateBanner updater={updater} onView={handleViewUpdate} />
          {!online && <div className="banner banner-error">Offline — check your connection.</div>}
          {error && (
            <div className="banner banner-error" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 180 }}>{error}</span>
              <button type="button" className="set-opt" style={{ padding: "4px 10px", fontSize: 11 }} onClick={handleRetry} disabled={loading} aria-busy={loading}>
                {loading ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span className="inline-loader" style={{ width: 10, height: 10, borderWidth: 1.5 }} aria-hidden /> Retrying…
                  </span>
                ) : (
                  "Retry"
                )}
              </button>
            </div>
          )}
          {sourceLabel && !error && (
            <div className="banner banner-info">
              Loaded: {sourceLabel} · {channels.length} channels
            </div>
          )}
          <ErrorBoundary><Player channel={active} onBack={goHome} profileId={activeId} zapList={channels} onZap={setActive} getEpgForChannel={getEpgForChannel} /></ErrorBoundary>
        </main>
      </div>
      {globalSearchOverlay}
      {splashOverlay}
      </>
    );
  }

  return (
    <>
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
        {isBrowseLoading && <ColorBar className="colorbar--loading" />}
        <UpdateBanner updater={updater} onView={handleViewUpdate} />
        {error && (
          <div className="banner banner-error" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: 180 }}>{error}</span>
            <button type="button" className="set-opt" style={{ padding: "4px 10px", fontSize: 11 }} onClick={handleRetry} disabled={loading} aria-busy={loading}>
              {loading ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span className="inline-loader" style={{ width: 10, height: 10, borderWidth: 1.5 }} aria-hidden /> Retrying…
                </span>
              ) : (
                "Retry"
              )}
            </button>
          </div>
        )}
        {!online && <div className="banner banner-error">Offline — check your connection.</div>}
        <nav className="browse-crumbs" aria-label="Breadcrumb">
          <button type="button" className="crumb" onClick={goHome}>Home</button>
          <span className="crumb-sep" aria-hidden>▸</span>
          <span className="crumb crumb--current">{contentMode === "movie" ? appStrings.movies : contentMode === "series" ? appStrings.series : appStrings.live}</span>
          <span className="crumb-sep" aria-hidden>▸</span>
          <span className="crumb crumb--current">{smartFilter === "favorites" ? appStrings.favorites : smartFilter === "continue" ? appStrings.continue : appStrings.all}</span>
          {category ? (
            <>
              <span className="crumb-sep" aria-hidden>▸</span>
              <button type="button" className="crumb" onClick={() => setCategory(null)} title="Clear category">{category}</button>
            </>
          ) : null}
          {search.trim() && (
            <>
              <span className="crumb-sep" aria-hidden>▸</span>
              <span className="crumb crumb--search">
                Search: {search.trim()}
                <button type="button" className="crumb-clear" onClick={() => setSearch("")} aria-label="Clear search">×</button>
              </span>
            </>
          )}
        </nav>
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
        {globalSearchOverlay}
        {pinAsk && (
          <div className="cmd-palette-backdrop" onClick={() => { setPinAsk(null); setPinError(null); }}>
            <div
              ref={pinDialogRef}
              className="cmd-palette"
              role="dialog"
              aria-modal="true"
              aria-label="Enter PIN"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: "8px 0" }}>🔒 Locked: {pinAsk}</h3>
              <input
                type="password"
                placeholder="Enter PIN"
                value={pinInput}
                onChange={(e) => { setPinInput(e.target.value); if (pinError) setPinError(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (pinInput === parental.pin) {
                      setCategory(pinAsk);
                      setPinAsk(null);
                      setPinInput("");
                      setPinError(null);
                    } else {
                      setPinError("Wrong PIN — try again");
                    }
                  }
                }}
                aria-invalid={pinError ? "true" : undefined}
                aria-describedby={pinError ? "pin-error" : undefined}
                autoFocus
              />
              {pinError && (
                <p id="pin-error" className="pin-error shake" role="alert">{pinError}</p>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  className="change-source"
                  onClick={() => {
                    if (pinInput === parental.pin) {
                      setCategory(pinAsk!);
                      setPinAsk(null);
                      setPinInput("");
                      setPinError(null);
                    } else setPinError("Wrong PIN — try again");
                  }}
                >
                  Unlock
                </button>
                <button type="button" className="pc-btn" onClick={() => { setPinAsk(null); setPinError(null); }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        {showClearPrompt && (
          <div className="cmd-palette-backdrop" style={{alignItems:"center", paddingTop:0}} onClick={() => setShowClearPrompt(false)}>
            <div ref={clearDialogRef} className="cmd-palette" role="dialog" aria-modal="true" aria-label="Clear Continue Watching confirmation" onClick={(e)=> e.stopPropagation()}>
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
              ref={helpDialogRef}
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
          {(() => {
            const isGridLoading = contentMode === "movie" ? moviesLoading : seriesLoading;
            const showSkeleton = isGridLoading && posterCards.length === 0;
            if (showSkeleton) {
              return (
                <div aria-busy="true" aria-live="polite">
                  <PosterGridSkeleton count={12} />
                  <div style={{ display: "flex", justifyContent: "center", padding: "12px 16px", gap: 8, alignItems: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--on-surface-variant)" }}>
                    <span className="inline-loader" aria-hidden />
                    {contentMode === "movie" ? "Loading titles…" : "Loading shows…"}
                  </div>
                </div>
              );
            }
            return (
              <PosterGrid
                items={posterCards}
                onOpen={handleOpenPoster}
                onRemove={handleRemoveWatched}
                showRemove={smartFilter === "continue"}
                favoriteIds={favoriteIds}
                onToggleFavorite={handleTogglePosterFavorite}
                getPosition={getPosition}
                emptyText={
                  smartFilter === "favorites"
                    ? "No favorites yet — tap ★ to keep it here."
                    : smartFilter === "continue"
                      ? "Nothing watched yet — open something and it will show up here."
                      : "Nothing here yet."
                }
              />
            );
          })()}
        </ErrorBoundary>
      </main>
    </div>
    {splashOverlay}
    </>
  );
}
