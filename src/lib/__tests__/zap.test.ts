import { describe, expect, it } from "vitest";
import { zapNeighbors, zapStep } from "../zap";
import type { Channel } from "../../types";

const list: Channel[] = [
  { id: "a", name: "A", url: "http://a", group: "G" },
  { id: "b", name: "B", url: "http://b", group: "G" },
  { id: "c", name: "C", url: "http://c", group: "G" },
];

describe("zapStep", () => {
  it("wraps forward", () => {
    expect(zapStep(list, "c", 1)?.id).toBe("a");
  });
  it("wraps backward", () => {
    expect(zapStep(list, "a", -1)?.id).toBe("c");
  });
  it("returns first when no current", () => {
    expect(zapStep(list, null, 1)?.id).toBe("a");
  });
});

describe("zapNeighbors", () => {
  it("returns radius*2+1 capped by list size", () => {
    expect(zapNeighbors(list, "b", 1)).toHaveLength(3);
    expect(zapNeighbors(list, "b", 3)).toHaveLength(3);
  });
  it("deduplicates when radius >= list.length", () => {
    const neighbors = zapNeighbors(list, "a", 5);
    const ids = neighbors.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(neighbors).toHaveLength(3);
  });
  it("handles single-item list", () => {
    const single: Channel[] = [{ id: "x", name: "X", url: "http://x", group: "G" }];
    expect(zapNeighbors(single, "x", 3)).toEqual(single);
  });
  it("handles empty list", () => {
    expect(zapNeighbors([], null, 3)).toEqual([]);
  });
});
