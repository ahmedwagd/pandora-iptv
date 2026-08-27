import { describe, expect, it } from "vitest";
import { parseM3U, groupChannels } from "../m3uParser";
import { parseAttributes } from "../m3u/attributes";
import { extractExtInfHeaders, parseVlcOpt, isAbsoluteUrl } from "../m3u/headers";

describe("parseM3U altUrls", () => {
  it("single url", () => {
    const m3u = `#EXTM3U\n#EXTINF:-1 tvg-logo=\"a.png\" group-title=\"News\",Ch A\nhttp://a.m3u8`;
    const ch = parseM3U(m3u);
    expect(ch).toHaveLength(1);
    expect(ch[0].url).toBe("http://a.m3u8");
    expect(ch[0].altUrls).toBeUndefined();
  });
  it("consecutive urls become altUrls", () => {
    const m3u = `#EXTM3U\n#EXTINF:-1 group-title=\"News\",Ch A\nhttp://primary.m3u8\nhttp://backup1.m3u8\nhttp://backup2.m3u8\n#EXTINF:-1,Ch B\nhttp://b.m3u8`;
    const ch = parseM3U(m3u);
    expect(ch).toHaveLength(2);
    expect(ch[0].url).toBe("http://primary.m3u8");
    expect(ch[0].altUrls).toEqual(["http://backup1.m3u8", "http://backup2.m3u8"]);
    expect(ch[1].url).toBe("http://b.m3u8");
  });
  it("bare url without EXTINF at top becomes its own entry", () => {
    const m3u = `http://lonely.m3u8`;
    const ch = parseM3U(m3u);
    expect(ch).toHaveLength(1);
    expect(ch[0].url).toBe("http://lonely.m3u8");
  });
  it("bare trailing url attaches as alt to previous", () => {
    const m3u = `#EXTINF:-1,Ch A\nhttp://a.m3u8\nhttp://a-backup.m3u8`;
    const ch = parseM3U(m3u);
    expect(ch[0].altUrls).toEqual(["http://a-backup.m3u8"]);
  });
});

describe("parseM3U headers", () => {
  it("extracts http-user-agent and referrer from EXTINF", () => {
    const m3u = `#EXTM3U\n#EXTINF:-1 tvg-id=\"x\" http-user-agent=\"VLC/3.0\" http-referrer=\"https://example.com\",Ch\nhttp://a.m3u8`;
    const ch = parseM3U(m3u);
    expect(ch[0].headers).toMatchObject({ "User-Agent": "VLC/3.0", Referer: "https://example.com" });
  });
  it("extracts EXTVLCOPT headers", () => {
    const m3u = `#EXTM3U\n#EXTINF:-1,Ch A\n#EXTVLCOPT:http-user-agent=VLC/3.0 LibVLC\n#EXTVLCOPT:http-referrer=https://ref.example.com\nhttp://a.m3u8`;
    const ch = parseM3U(m3u);
    expect(ch[0].headers).toMatchObject({ "User-Agent": "VLC/3.0 LibVLC", Referer: "https://ref.example.com" });
  });
  it("parses tvg-logo and group-title", () => {
    const m3u = `#EXTM3U\n#EXTINF:-1 tvg-logo=\"https://logo.png\" group-title=\"Sports\" tvg-id=\"SPORT1\",Channel\nhttp://a.m3u8`;
    const ch = parseM3U(m3u);
    expect(ch[0].logo).toBe("https://logo.png");
    expect(ch[0].group).toBe("Sports");
    expect(ch[0].tvgId).toBe("SPORT1");
  });
  it("skips HLS variant relatives url_0/...", () => {
    const m3u = `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nurl_0/playlist.m3u8\n#EXTINF:-1,Real\nhttp://real.m3u8`;
    const ch = parseM3U(m3u);
    expect(ch.some((c) => c.url.includes("url_0"))).toBe(false);
    expect(ch[0].url).toBe("http://real.m3u8");
  });
  it("skips empty lines and comments", () => {
    const m3u = `#EXTM3U\n\n#EXTGRP:News\n#EXTINF:-1,Ch\nhttp://a.m3u8\n`;
    expect(parseM3U(m3u)).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("parseAttributes lowercases keys", () => {
    expect(parseAttributes(`#EXTINF:-1 tVg-Logo=\"a\" GROUP-TITLE=\"News\",Ch`)).toMatchObject({
      "tvg-logo": "a",
      "group-title": "News",
    });
  });
  it("extractExtInfHeaders handles quoted and unquoted", () => {
    expect(extractExtInfHeaders(`#EXTINF:-1 http-user-agent=VLC/3.0,Ch`)).toMatchObject({ "User-Agent": "VLC/3.0" });
  });
  it("parseVlcOpt handles http-origin", () => {
    expect(parseVlcOpt("#EXTVLCOPT:http-origin=https://example.com")).toEqual({ Origin: "https://example.com" });
    expect(parseVlcOpt("#EXTVLCOPT:bogus")).toBeNull();
  });
  it("isAbsoluteUrl", () => {
    expect(isAbsoluteUrl("http://a.m3u8")).toBe(true);
    expect(isAbsoluteUrl("/path")).toBe(true);
    expect(isAbsoluteUrl("rtmp://a")).toBe(true);
    expect(isAbsoluteUrl("url_0/x.m3u8")).toBe(false);
  });
  it("groupChannels preserves order", () => {
    const m3u = `#EXTM3U\n#EXTINF:-1 group-title=\"B\",Ch1\nhttp://a\n#EXTINF:-1 group-title=\"A\",Ch2\nhttp://b\n#EXTINF:-1 group-title=\"B\",Ch3\nhttp://c`;
    const ch = parseM3U(m3u);
    const g = groupChannels(ch);
    expect([...g.keys()]).toEqual(["B", "A"]);
    expect(g.get("B")).toHaveLength(2);
  });
});
