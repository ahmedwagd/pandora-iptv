import type { Channel } from "../../types";
import { parseM3U } from "./parser";

/**
 * Detects HLS master playlists that were mistakenly pasted as M3U channel lists.
 * HLS masters contain #EXT-X-STREAM-INF but no #EXTINF channel entries.
 */
export function isHlsMasterPlaylist(text: string): boolean {
  return text.includes("#EXT-X-STREAM-INF") && !text.includes("#EXTINF:");
}

/**
 * Coerces a parsed HLS master result into a single live channel.
 * Handles the case where parseM3U mis-parsed variants as relative url_0/... channels.
 */
export function coerceHlsMasterToSingleChannel(
  parsed: Channel[],
  url: string,
  label?: string
): Channel[] {
  if (parsed.length > 0 && parsed[0].url.startsWith("url_")) {
    parsed = [];
  }
  if (parsed.length === 0) {
    const name = label ?? url.split("/").pop()?.replace(".m3u8", "") ?? "HLS Stream";
    return [{ id: `hls:${url}`, name, url, group: "HLS", kind: "live" as const }];
  }
  return parsed;
}

export function parseM3UWithHlsGuard(content: string, url: string, label?: string): Channel[] {
  if (!isHlsMasterPlaylist(content)) return parseM3U(content);
  const parsed = parseM3U(content);
  return coerceHlsMasterToSingleChannel(parsed, url, label);
}
