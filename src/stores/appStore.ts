import { create } from "zustand";
import type { Channel, ContentMode, Series } from "../types";
import type { SmartFilter } from "../types/filters";

export type Screen = "home" | "browse" | "detail" | "watch" | "settings";
export type DetailTarget = { kind: "movie"; channel: Channel } | { kind: "series"; series: Series };

interface AppStore {
  // navigation
  screen: Screen;
  contentMode: ContentMode;
  active: Channel | null;
  detailTarget: DetailTarget | null;

  // browse filters
  smartFilter: SmartFilter;
  category: string | null;
  search: string;

  // actions
  setScreen: (s: Screen) => void;
  setContentMode: (m: ContentMode) => void;
  setActive: (c: Channel | null) => void;
  setDetailTarget: (d: DetailTarget | null) => void;
  setSmartFilter: (f: SmartFilter) => void;
  setCategory: (c: string | null) => void;
  setSearch: (v: string) => void;

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

export const useAppStore = create<AppStore>((set) => ({
  screen: "home",
  contentMode: "live",
  active: null,
  detailTarget: null,
  smartFilter: "all",
  category: null,
  search: "",

  setScreen: (screen) => set({ screen }),
  setContentMode: (contentMode) => set({ contentMode }),
  setActive: (active) => set({ active }),
  setDetailTarget: (detailTarget) => set({ detailTarget }),
  setSmartFilter: (smartFilter) => set({ smartFilter, category: null }),
  setCategory: (category) => set({ category, smartFilter: "all" }),
  setSearch: (search) => set({ search }),

  // Pure transitions — caller composes side-effects (closeSeries/disconnect) outside store
  enterContent: (mode) =>
    set({
      contentMode: mode,
      smartFilter: "all",
      category: null,
      search: "",
      screen: "browse",
    }),

  goHome: () => set({ screen: "home", active: null, detailTarget: null }),

  handleDisconnect: () =>
    set({
      active: null,
      detailTarget: null,
      contentMode: "live",
      smartFilter: "all",
      category: null,
      search: "",
      screen: "home",
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
    });
  },
  goHomeLegacy: (closeSeries) => {
    closeSeries();
    set({ screen: "home", active: null, detailTarget: null });
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
    });
  },
}));
