import { describe, expect, it } from "vitest";
import { parseM3U } from "../m3uParser";

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
