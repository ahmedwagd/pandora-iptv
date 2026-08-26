import { describe, expect, it } from "vitest";
import { buildXtreamCatchupUrl, parseCatchup } from "../xtream";
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
