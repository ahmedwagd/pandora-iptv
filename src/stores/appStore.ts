import { create } from "zustand";
import type { Channel, ContentMode, Series } from "../types";
import type { SmartFilter } from "../types/filters";
import { getValue, setValue } from "../lib/store";
import { browseFiltersKey } from "../lib/storageKeys";

export type Screen = "home" | "browse" | "detail" | "watch" | "settings";
export type DetailTarget = { kind: "movie"; channel: Channel } | { kind: "series"; series: Series };

export interface BrowseFiltersSnapshot {
  smartFilter: SmartFilter;
  category: string | null;
  search: string;
}

interface AppStore {
  // navigation
  screen: Screen;
  contentMode: ContentMode;
  active: Channel | null;
  detailTarget: DetailTarget | null;
  screenHistory: Screen[];
  prevScreen: Screen | null;

  // browse filters
  smartFilter: SmartFilter;
  category: string | null;
  search: string;

  // actions
  setScreen: (s: Screen) => void;
  pushScreen: (next: Screen) => void;
  popScreen: () => void;
  setContentMode: (m: ContentMode) => void;
  setActive: (c: Channel | null) => void;
  setDetailTarget: (d: DetailTarget | null) => void;
  setSmartFilter: (f: SmartFilter) => void;
  setCategory: (c: string | null) => void;
  setSearch: (v: string) => void;
  applyBrowseFilters: (f: BrowseFiltersSnapshot) => void;

  // persistence per profile+contentMode
  hydrateBrowseFilters: (profileId: string | null, contentMode: ContentMode) => Promise<void>;
  persistBrowseFilters: (profileId: string | null, contentMode: ContentMode) => void;

  // composite actions — pure store transitions, no callback injection (DIP)
  enterContent: (mode: ContentMode) => void;
  goHome: () => void;
  handleDisconnect: () => void;
  resetBrowseFilters: () => void;

  // deprecated callback-based aliases for backward compat (will be removed)
  /** @deprecated use enterContent(mode) and handle closeSeries in caller */
  enterContentLegacy: (mode: ContentMode, closeSeries: () => void) => void;
  /** @deprecated use goHome() */
  goHomeLegacy: (closeSeries: () => void) => void;
  /** @deprecated use handleDisconnect() */
  handleDisconnectLegacy: (disconnect: () => void) => void;
}

function persistSnapshot(profileId: string | null, contentMode: string, snap: BrowseFiltersSnapshot) {
  if (!profileId) return;
  const key = browseFiltersKey(profileId, contentMode);
  void setValue(key, snap).catch(() => {});
  try {
    const raw = JSON.stringify(snap);
    localStorage.setItem(`panora:${key}`, raw);
    localStorage.setItem(key, raw);
  } catch {}
}

export const useAppStore = create<AppStore>((set, get) => ({
  screen: "home",
  contentMode: "live",
  active: null,
  detailTarget: null,
  screenHistory: [],
  prevScreen: null,
  smartFilter: "all",
  category: null,
  search: "",

  setScreen: (screen) => set({ screen }),
  pushScreen: (next) =>
    set((s) => {
      if (s.screen === next) return {} as Partial<AppStore>;
      return {
        screenHistory: [...s.screenHistory, s.screen],
        prevScreen: s.screen,
        screen: next,
      };
    }),
  popScreen: () =>
    set((s) => {
      if (s.screenHistory.length > 0) {
        const hist = [...s.screenHistory];
        const prev = hist.pop() as Screen;
        return {
          screen: prev,
          screenHistory: hist,
          prevScreen: hist[hist.length - 1] ?? null,
        };
      }
      if (s.prevScreen) {
        return { screen: s.prevScreen, prevScreen: null };
      }
      return { screen: "home" as Screen, prevScreen: null, screenHistory: [] };
    }),
  setContentMode: (contentMode) => set({ contentMode }),
  setActive: (active) => set({ active }),
  setDetailTarget: (detailTarget) => set({ detailTarget }),
  setSmartFilter: (smartFilter) => {
    set({ smartFilter, category: null });
  },
  setCategory: (category) => {
    set({ category, smartFilter: "all" });
  },
  setSearch: (search) => set({ search }),
  applyBrowseFilters: (f) => set({ smartFilter: f.smartFilter, category: f.category, search: f.search }),
  hydrateBrowseFilters: async (profileId, contentMode) => {
    if (!profileId) return;
    const key = browseFiltersKey(profileId, contentMode);
    try {
      let snap: BrowseFiltersSnapshot | undefined;
      try {
        snap = await getValue<BrowseFiltersSnapshot>(key);
      } catch {}
      if (!snap) {
        try {
          const raw = localStorage.getItem(`panora:${key}`) ?? localStorage.getItem(key);
          if (raw) snap = JSON.parse(raw) as BrowseFiltersSnapshot;
        } catch {}
      }
      // legacy fallback: check without profile scoping (for tests)
      if (!snap) {
        try {
          const legacyRaw = localStorage.getItem(`filters:${contentMode}`);
          if (legacyRaw) snap = JSON.parse(legacyRaw) as BrowseFiltersSnapshot;
        } catch {}
      }
      if (snap && typeof snap === "object") {
        const validFilters: SmartFilter[] = ["all", "favorites", "continue"];
        const sf = validFilters.includes(snap.smartFilter) ? snap.smartFilter : "all";
        const cat = typeof snap.category === "string" || snap.category === null ? snap.category : null;
        const srch = typeof snap.search === "string" ? snap.search : "";
        set({ smartFilter: sf, category: cat, search: srch });
      }
    } catch {}
  },
  persistBrowseFilters: (profileId, contentMode) => {
    if (!profileId) return;
    const { smartFilter, category, search } = get();
    persistSnapshot(profileId, contentMode, { smartFilter, category, search });
  },

  // Pure transitions — caller composes side-effects (closeSeries/disconnect) outside store
  enterContent: (mode) =>
    set({
      contentMode: mode,
      smartFilter: "all",
      category: null,
      search: "",
      screen: "browse",
      screenHistory: [],
      prevScreen: null,
    }),

  goHome: () => set({ screen: "home", active: null, detailTarget: null, screenHistory: [], prevScreen: null }),

  handleDisconnect: () =>
    set({
      active: null,
      detailTarget: null,
      contentMode: "live",
      smartFilter: "all",
      category: null,
      search: "",
      screen: "home",
      screenHistory: [],
      prevScreen: null,
    }),

  resetBrowseFilters: () => set({ smartFilter: "all", category: null, search: "" }),

  // Legacy wrappers — keep for existing callers during migration
  enterContentLegacy: (mode, closeSeries) => {
    closeSeries();
    set({
      contentMode: mode,
      smartFilter: "all",
      category: null,
      search: "",
      screen: "browse",
      screenHistory: [],
      prevScreen: null,
    });
  },
  goHomeLegacy: (closeSeries) => {
    closeSeries();
    set({ screen: "home", active: null, detailTarget: null, screenHistory: [], prevScreen: null });
  },
  handleDisconnectLegacy: (disconnect) => {
    disconnect();
    set({
      active: null,
      detailTarget: null,
      contentMode: "live",
      smartFilter: "all",
      category: null,
      search: "",
      screen: "home",
      screenHistory: [],
      prevScreen: null,
    });
  },
}));
