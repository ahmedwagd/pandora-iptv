import { create } from "zustand";
import type { Channel, ContentMode, Series } from "../types";
import type { SmartFilter } from "../components/FilterSidebar";

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

  // composite actions (mirror App.tsx callbacks)
  enterContent: (mode: ContentMode, closeSeries: () => void) => void;
  goHome: (closeSeries: () => void) => void;
  handleDisconnect: (disconnect: () => void) => void;
  resetBrowseFilters: () => void;
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

  enterContent: (mode, closeSeries) => {
    closeSeries();
    set({
      contentMode: mode,
      smartFilter: "all",
      category: null,
      search: "",
      screen: "browse",
    });
  },

  goHome: (closeSeries) => {
    closeSeries();
    set({ screen: "home", active: null, detailTarget: null });
  },

  handleDisconnect: (disconnect) => {
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

  resetBrowseFilters: () => set({ smartFilter: "all", category: null, search: "" }),
}));
