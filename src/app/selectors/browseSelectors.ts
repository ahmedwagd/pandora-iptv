import type { Channel, Series } from "../../types";
import type { SmartFilter } from "../../components/FilterSidebar";
import type { PosterCard } from "../../components/PosterGrid";
import type { WatchItem } from "../../types";

export type SortKey = "name-asc" | "name-desc" | "recent";

const categoryCollator = new Intl.Collator(undefined, { sensitivity: "base" });

export function selectCategories(
  contentMode: "movie" | "series",
  movies: Channel[],
  series: Series[]
): string[] {
  const list = contentMode === "movie" ? movies.map((m) => m.group) : series.map((s) => s.group);
  return Array.from(new Set(list)).sort((a, b) => categoryCollator.compare(a, b));
}

export function selectPosterCards(args: {
  contentMode: "movie" | "series";
  smartFilter: SmartFilter;
  category: string | null;
  search: string;
  sortKey: SortKey;
  movies: Channel[];
  series: Series[];
  history: WatchItem[];
  favoriteIds: Set<string>;
}): PosterCard[] {
  const {
    contentMode,
    smartFilter,
    category,
    search,
    sortKey,
    movies,
    series,
    history,
    favoriteIds,
  } = args;
  const term = search.trim().toLowerCase();

  const sortCards = (cards: PosterCard[]): PosterCard[] => {
    if (sortKey === "name-asc")
      return cards.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    if (sortKey === "name-desc")
      return cards.sort((a, b) => b.name.localeCompare(a.name, undefined, { sensitivity: "base" }));
    return cards; // recent = keep source order (playlist recent / history recent already newest first)
  };
  if (contentMode === "movie") {
    if (smartFilter === "continue") {
      let cards = history
        .filter((h) => h.kind === "movie")
        .map((h) => ({ id: h.id, name: h.name, poster: h.poster }));
      if (term) cards = cards.filter((c) => c.name.toLowerCase().includes(term));
      return sortKey === "recent" ? cards : sortCards(cards);
    }
    let list = smartFilter === "favorites" ? movies.filter((m) => favoriteIds.has(m.id)) : movies;
    if (category) list = list.filter((m) => m.group === category);
    if (term) list = list.filter((m) => m.name.toLowerCase().includes(term));
    const cards = list.map((m) => ({ id: m.id, name: m.name, poster: m.logo }));
    return sortCards(cards);
  }
  if (smartFilter === "continue") {
    let cards = history
      .filter((h) => h.kind === "episode")
      .map((h) => ({ id: h.id, name: h.name, poster: h.poster }));
    if (term) cards = cards.filter((c) => c.name.toLowerCase().includes(term));
    return sortKey === "recent" ? cards : sortCards(cards);
  }
  let list = series;
  if (smartFilter === "favorites") list = series.filter((s) => favoriteIds.has(`series:${s.id}`));
  if (category) list = list.filter((s) => s.group === category);
  if (term) list = list.filter((s) => s.name.toLowerCase().includes(term));
  const cards = list.map((s) => ({ id: s.id, name: s.name, poster: s.cover }));
  return sortCards(cards);
}
