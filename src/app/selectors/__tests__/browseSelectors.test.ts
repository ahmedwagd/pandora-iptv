import { describe, it, expect } from "vitest";
import { selectPosterCards } from "../browseSelectors";
import type { Channel, Series } from "../../../types";

const movies: Channel[] = [
  { id: "movie:1", name: "Zulu", url: "http://a", logo: "", group: "Action", kind: "movie" },
  { id: "movie:2", name: "Apple", url: "http://b", logo: "", group: "Action", kind: "movie" },
];
const series: Series[] = [];
describe("selectPosterCards sort", () => {
  it("A-Z", () => {
    const cards = selectPosterCards({
      contentMode: "movie",
      smartFilter: "all",
      category: null,
      search: "",
      sortKey: "name-asc",
      movies,
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
      movies,
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
      movies,
      series,
      history: [],
      favoriteIds: new Set(),
    });
    expect(cards.length).toBe(1);
  });
});
