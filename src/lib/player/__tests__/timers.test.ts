import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PlayerTimers } from "../timers";

describe("PlayerTimers", () => {
  let timers: PlayerTimers;
  beforeEach(() => {
    timers = new PlayerTimers();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    timers.clearAllWithZap();
  });

  it("schedules and clears retry", () => {
    const fn = vi.fn();
    timers.scheduleRetry(fn, 1000);
    expect(timers.ids.retry).not.toBeNull();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    timers.clearRetry();
    expect(timers.ids.retry).toBeNull();
  });

  it("clearAll clears stall/connect/retry", () => {
    timers.armStall(vi.fn(), 1000);
    timers.armConnect(vi.fn(), 1000);
    timers.scheduleRetry(vi.fn(), 1000);
    expect(timers.ids.stall).not.toBeNull();
    expect(timers.ids.connect).not.toBeNull();
    expect(timers.ids.retry).not.toBeNull();
    timers.clearAll();
    expect(timers.ids).toEqual(expect.objectContaining({ retry: null, stall: null, connect: null }));
  });

  it("armConnect clears pending retry (avoids overlap hang at 3/3)", () => {
    const retry = vi.fn();
    timers.scheduleRetry(retry, 5000);
    timers.armConnect(vi.fn(), 100);
    expect(timers.ids.retry).toBeNull();
  });

  it("scheduleZapHide replaces previous", () => {
    const a = vi.fn(); const b = vi.fn();
    timers.scheduleZapHide(a, 4000);
    const first = timers.ids.zapHide;
    timers.scheduleZapHide(b, 4000);
    expect(timers.ids.zapHide).not.toBe(first);
    vi.advanceTimersByTime(4000);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});
