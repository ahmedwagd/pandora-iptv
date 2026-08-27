import { describe, expect, it } from "vitest";
import { buildSearchIndex, rankResults, SEARCH_SCORING, groupRanked } from "../searchIndex";
import type { Channel, Series } from "../../types";

const live: Channel[] = [
  { id: "1", name: "BBC One", url: "http://a", group: "News", kind: "live" },
  { id: "2", name: "Sky Sports", url: "http://b", group: "Sports", kind: "live" },
  { id: "3", name: "Télé Sports", url: "http://c", group: "Sports", kind: "live" },
];
const movies: Channel[] = [
  { id: "movie:10", name: "Skyfall", url: "http://m", group: "Action", kind: "movie" },
];
const series: Series[] = [
  { id: "100", name: "Breaking Bad", group: "Drama", cover: "" },
];

describe("buildSearchIndex", () => {
  it("builds combined index", () => {
    const idx = buildSearchIndex({ channels: live, movies, series });
    expect(idx).toHaveLength(5);
  });
  it("handles empty inputs", () => {
    expect(buildSearchIndex({ channels: [], movies: [], series: [] })).toEqual([]);
  });
});

describe("rankResults", () => {
  it("ranks prefix higher than substring and group", () => {
    const idx = buildSearchIndex({ channels: live, movies, series });
    const r = rankResults(idx, "sky");
    expect(r[0].name).toBe("Sky Sports");
    expect(r.length).toBe(2);
  });
  it("exact match scores highest", () => {
    const idx = buildSearchIndex({ channels: live, movies, series });
    const r = rankResults(idx, "breaking bad");
    expect(r[0].score).toBe(SEARCH_SCORING.EXACT);
  });
  it("epg boost surfaces live via programme title", () => {
    const idx = buildSearchIndex({ channels: live, movies, series });
    const r = rankResults(idx, "breaking", {
      getEpgForChannel: (id) => (id === "1" ? { now: { title: "Breaking News" } } : undefined),
    });
    const liveHit = r.find((x) => x.id === "1");
    expect(liveHit?.score).toBeGreaterThanOrEqual(SEARCH_SCORING.EPG_BOOST);
  });
  it("returns empty on empty query", () => {
    const idx = buildSearchIndex({ channels: live, movies, series });
    expect(rankResults(idx, "")).toEqual([]);
    expect(rankResults(idx, "   ")).toEqual([]);
  });
  it("handles diacritics via normalization", () => {
    const idx = buildSearchIndex({ channels: live, movies, series });
    const r = rankResults(idx, "tele");
    expect(r.some((x) => x.name === "Télé Sports")).toBe(true);
  });
  it("respects limit", () => {
    const idx = buildSearchIndex({ channels: live, movies, series });
    expect(rankResults(idx, "s", { limit: 1 })).toHaveLength(1);
  });
  it("groups ranked by kind", () => {
    const idx = buildSearchIndex({ channels: live, movies, series });
    const ranked = rankResults(idx, "sky");
    const g = groupRanked(ranked);
    expect(g.live.length).toBeGreaterThan(0);
    expect(g.movie.length).toBeGreaterThan(0);
  });
});
