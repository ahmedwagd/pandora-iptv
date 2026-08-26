import { describe, expect, it } from "vitest";
import { buildSearchIndex, rankResults } from "../searchIndex";
import type { Channel, Series } from "../../types";

const live: Channel[] = [
  { id: "1", name: "BBC One", url: "http://a", group: "News", kind: "live" },
  { id: "2", name: "Sky Sports", url: "http://b", group: "Sports", kind: "live" },
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
    expect(idx).toHaveLength(4);
  });
});

describe("rankResults", () => {
  it("ranks prefix higher", () => {
    const idx = buildSearchIndex({ channels: live, movies, series });
    const r = rankResults(idx, "sky");
    expect(r[0].name).toBe("Sky Sports"); // prefix over Skyfall substring? both prefix but live first due to name
    expect(r.length).toBe(2);
  });
  it("epg boost", () => {
    const idx = buildSearchIndex({ channels: live, movies, series });
    const r = rankResults(idx, "breaking", { getEpgForChannel: () => ({ now: { title: "Breaking News" } }) });
    // EPG boost shouldn't outrank direct name match for series but should boost live
    expect(r[0].name).toBe("Breaking Bad");
  });
  it("returns empty on empty query", () => {
    const idx = buildSearchIndex({ channels: live, movies, series });
    expect(rankResults(idx, "")).toEqual([]);
  });
});
