import { describe, expect, it, vi } from "vitest";
import { buildXtreamCatchupUrl, parseCatchup, buildXtreamAltBases, buildXtreamLiveAltUrls } from "../xtream";
import { parseEpgTime, toEpgProgramme, extractListings, buildEpgMap } from "../xtream/epg";
import { fetchJson } from "../xtream/http";
import type { XtreamCreds } from "../../types";

describe("buildXtreamCatchupUrl", () => {
  it("builds catchup url", () => {
    const creds: XtreamCreds = { server: "http://host:8080", username: "u", password: "p" };
    const url = buildXtreamCatchupUrl(creds, 123, 1000, 2000);
    expect(url).toBe("http://host:8080/live/u/p/123-1000-2000.m3u8");
  });
});

describe("parseCatchup", () => {
  it("returns null when not enabled", () => {
    expect(parseCatchup({ stream_id: 1, name: "A", stream_icon: null, epg_channel_id: null, category_id: "1" } as any)).toBeNull();
  });
  it("parses days", () => {
    const s: any = { stream_id: 1, name: "A", stream_icon: null, epg_channel_id: null, category_id: "1", tv_archive: 1, tv_archive_duration: "3" };
    const c = parseCatchup(s);
    expect(c?.days).toBe(3);
  });
});

describe("buildXtreamAltBases", () => {
  it("derives alt from server_info url without port", () => {
    const creds: XtreamCreds = { server: "http://mhiptv.info", username: "u", password: "p" };
    const alts = buildXtreamAltBases(creds, { url: "http://mhiptv.info", port: "8080", https_port: "443" });
    expect(alts.some((u) => u.includes(":8080"))).toBe(true);
  });
  it("uses common ports when server_info empty and no port in primary", () => {
    const creds: XtreamCreds = { server: "http://example.com", username: "u", password: "p" };
    const alts = buildXtreamAltBases(creds, {});
    expect(alts.length).toBeGreaterThan(0);
    expect(alts[0]).toMatch(/:\d+$/);
  });
  it("returns empty when primary already has port and no server_info", () => {
    const creds: XtreamCreds = { server: "http://example.com:8080", username: "u", password: "p" };
    const alts = buildXtreamAltBases(creds, undefined);
    expect(alts).toEqual([]);
  });
  it("caps at 4", () => {
    const creds: XtreamCreds = { server: "http://example.com", username: "u", password: "p" };
    const alts = buildXtreamAltBases(creds, { url: "http://example.com", port: "8080" });
    expect(alts.length).toBeLessThanOrEqual(4);
  });
});

describe("buildXtreamLiveAltUrls", () => {
  it("builds alt urls from bases", () => {
    const creds: XtreamCreds = { server: "http://host:8080", username: "u", password: "p" };
    const alts = buildXtreamLiveAltUrls(creds, 123, ["http://host:25461", "https://host:443"]);
    expect(alts).toEqual(["http://host:25461/live/u/p/123.m3u8", "https://host:443/live/u/p/123.m3u8"]);
  });
});

describe("epg helpers", () => {
  it("parseEpgTime numeric and ISO", () => {
    expect(parseEpgTime(1724748000)).toBe(1724748000 * 1000);
    expect(parseEpgTime("2026-08-27 12:00:00")).toBeGreaterThan(0);
    expect(parseEpgTime("1724748000")).toBe(1724748000 * 1000);
    expect(parseEpgTime(undefined)).toBeUndefined();
  });
  it("toEpgProgramme maps", () => {
    const p = toEpgProgramme({ title: "News", start: "2026-08-27 06:00:00", stop: "2026-08-27 07:00:00", start_timestamp: "1724748000", stop_timestamp: "1724751600" } as any, "ch1");
    expect(p?.channelId).toBe("ch1");
    expect(p?.title).toBe("News");
  });
  it("extractListings handles array and map shapes", () => {
    expect(extractListings({ epg_listings: [{ title: "A", start: "2026-08-27 06:00:00", stop: "2026-08-27 07:00:00", start_timestamp: "1", stop_timestamp: "2" }] })).toHaveLength(1);
    expect(extractListings({ epg_listings: { "123": { title: "B", start: "2026-08-27 06:00:00", stop: "2026-08-27 07:00:00", start_timestamp: "1", stop_timestamp: "2" } as any } })).toHaveLength(1);
    expect(extractListings({ "999": [{ title: "C", start: "2026-08-27 06:00:00", stop: "2026-08-27 07:00:00", start_timestamp: "1", stop_timestamp: "2" }] })).toHaveLength(1);
  });
  it("buildEpgMap groups now/next", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const listings = [
      { channel_id: "ch1", title: "Past", start: "2026-08-26 06:00:00", stop: "2026-08-26 07:00:00", start_timestamp: String(nowSec - 7200), stop_timestamp: String(nowSec - 3600) },
      { channel_id: "ch1", title: "Now", start: "2026-08-27 06:00:00", stop: "2026-08-27 07:00:00", start_timestamp: String(nowSec - 10), stop_timestamp: String(nowSec + 3600) },
    ] as any;
    const m = buildEpgMap(listings);
    expect(m.get("ch1")?.now?.title).toBe("Now");
  });
});

describe("fetchJson", () => {
  it("retries on 5xx then succeeds", async () => {
    const mock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) });
    const res = await fetchJson(mock as any, "http://a", { retries: 1, timeoutMs: 0 });
    expect(res).toEqual({ ok: true });
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it("throws on 4xx without retry", async () => {
    const mock = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    await expect(fetchJson(mock as any, "http://a", { retries: 1, timeoutMs: 0 })).rejects.toThrow("HTTP 403");
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("does not retry on AbortError", async () => {
    const abort = new DOMException("abort", "AbortError");
    const mock = vi.fn().mockRejectedValue(abort);
    await expect(fetchJson(mock as any, "http://a", { retries: 2, timeoutMs: 0 })).rejects.toBe(abort);
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
