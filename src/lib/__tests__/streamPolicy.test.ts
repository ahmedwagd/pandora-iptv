import { describe, expect, it } from "vitest";
import {
  computeRetryDelay,
  decideAfterFailure,
  isConnectTimeout,
  isStalled,
  nextSourceIndex,
} from "../streamPolicy";

describe("computeRetryDelay", () => {
  it("exponential backoff", () => {
    expect(computeRetryDelay(0)).toBe(1000);
    expect(computeRetryDelay(1)).toBe(2000);
    expect(computeRetryDelay(2)).toBe(4000);
    expect(computeRetryDelay(3)).toBe(8000);
  });
  it("caps at 15000", () => {
    expect(computeRetryDelay(4)).toBe(15000);
    expect(computeRetryDelay(10)).toBe(15000);
  });
});

describe("nextSourceIndex", () => {
  it("advances within bounds", () => {
    expect(nextSourceIndex(0, 3)).toBe(1);
    expect(nextSourceIndex(1, 3)).toBe(2);
  });
  it("returns null when exhausted", () => {
    expect(nextSourceIndex(2, 3)).toBeNull();
    expect(nextSourceIndex(0, 1)).toBeNull();
  });
});

describe("isStalled / isConnectTimeout", () => {
  it("stalled", () => {
    expect(isStalled(0, 8000)).toBe(true);
    expect(isStalled(0, 7999)).toBe(false);
  });
  it("connect timeout", () => {
    expect(isConnectTimeout(0, 10000)).toBe(true);
    expect(isConnectTimeout(0, 9999)).toBe(false);
  });
});

describe("decideAfterFailure", () => {
  it("retries within source", () => {
    expect(decideAfterFailure({ sourceIndex: 0, totalSources: 2, attempt: 0 }).kind).toBe("retry");
    expect(decideAfterFailure({ sourceIndex: 0, totalSources: 2, attempt: 2 }).kind).toBe("retry");
  });
  it("switches source after max retries", () => {
    const d = decideAfterFailure({ sourceIndex: 0, totalSources: 2, attempt: 3 });
    expect(d.kind).toBe("switch-source");
    if (d.kind === "switch-source") expect(d.nextSourceIndex).toBe(1);
  });
  it("fails when both exhausted", () => {
    expect(decideAfterFailure({ sourceIndex: 1, totalSources: 2, attempt: 3 }).kind).toBe("fail");
    expect(decideAfterFailure({ sourceIndex: 0, totalSources: 1, attempt: 3 }).kind).toBe("fail");
  });
});
