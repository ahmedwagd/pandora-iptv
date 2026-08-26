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
  it("returns radius*2+1", () => {
    expect(zapNeighbors(list, "b", 1)).toHaveLength(3);
    expect(zapNeighbors(list, "b", 3)).toHaveLength(7);
  });
});
