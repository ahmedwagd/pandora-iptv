// @ts-nocheck
import { describe, it, expect } from "vitest";
import { selectPosterCards } from "../browseSelectors";
const movies = [
  { id: "movie:1", name: "Zulu", url: "", logo: "", group: "Action", kind: "movie" as const },
  { id: "movie:2", name: "Apple", url: "", logo: "", group: "Action", kind: "movie" as const },
];
const series: any[] = [];
describe("selectPosterCards sort", () => {
  it("A-Z", () => {
    const cards = selectPosterCards({
      contentMode: "movie",
      smartFilter: "all",
      category: null,
      search: "",
      sortKey: "name-asc",
      movies: movies as any,
      series,
      history: [],
      favoriteIds: new Set(),
    });
    expect(cards[0].name).toBe("Apple");
  });
  it("Z-A", () => {
    const cards = selectPosterCards({
      contentMode: "movie",
      smartFilter: "all",
      category: null,
      search: "",
      sortKey: "name-desc",
      movies: movies as any,
      series,
      history: [],
      favoriteIds: new Set(),
    });
    expect(cards[0].name).toBe("Zulu");
  });
  it("filters by search", () => {
    const cards = selectPosterCards({
      contentMode: "movie",
      smartFilter: "all",
      category: null,
      search: "zulu",
      sortKey: "name-asc",
      movies: movies as any,
      series,
      history: [],
      favoriteIds: new Set(),
    });
    expect(cards.length).toBe(1);
  });
});
