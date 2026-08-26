import type { Channel, Series } from "../../types";
import type { SmartFilter } from "../../components/FilterSidebar";
import type { PosterCard } from "../../components/PosterGrid";
import type { WatchItem } from "../../types";

export function selectCategories(
  contentMode: "movie" | "series",
  movies: Channel[],
  series: Series[]
): string[] {
  const list = contentMode === "movie" ? movies.map((m) => m.group) : series.map((s) => s.group);
  return Array.from(new Set(list));
}

export function selectPosterCards(args: {
  contentMode: "movie" | "series";
  smartFilter: SmartFilter;
  category: string | null;
  search: string;
  movies: Channel[];
  series: Series[];
  history: WatchItem[];
  favoriteIds: Set<string>;
}): PosterCard[] {
  const { contentMode, smartFilter, category, search, movies, series, history, favoriteIds } = args;
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
  if (smartFilter === "favorites") list = series.filter((s) => favoriteIds.has(`series:${s.id}`));
  if (category) list = list.filter((s) => s.group === category);
  if (term) list = list.filter((s) => s.name.toLowerCase().includes(term));
  return list.map((s) => ({ id: s.id, name: s.name, poster: s.cover }));
}
