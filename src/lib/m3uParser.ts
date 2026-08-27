import type { Channel } from "../types";

// Simple, dependency-free hash for stable channel ids (favorites keying)
function hashId(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

function parseAttributes(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // Local regex per call avoids shared global lastIndex state (see ATTR_RE bug)
  const re = /([a-zA-Z0-9-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    attrs[match[1].toLowerCase()] = match[2];
  }
  return attrs;
}

/**
 * Parses M3U/M3U8 playlist text (standard + IPTV extensions like
 * tvg-logo, tvg-id, group-title) into a flat list of Channels.
 *
 * Tolerant by design: skips malformed entries rather than throwing,
 * since real-world IPTV playlists are frequently inconsistent.
 */
export function parseM3U(content: string): Channel[] {
  const lines = content.split(/\r?\n/);
  const channels: Channel[] = [];

  let pendingName = "";
  let pendingAttrs: Record<string, string> = {};
  let pendingHeaders: Record<string, string> = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      // Format: #EXTINF:-1 tvg-id="..." tvg-logo="..." group-title="...",Channel Name
      const commaIdx = line.lastIndexOf(",");
      pendingName = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : "Unnamed Channel";
      pendingAttrs = parseAttributes(line);
      // iptv-org uses http-user-agent / http-referrer as attributes on EXTINF (no quotes sometimes)
      // also catch them here for the pending channel
      const lower = line.toLowerCase();
      const uaMatch = lower.match(/http-user-agent="([^"]+)"/) || line.match(/http-user-agent=([^\s"]+)/i);
      if (uaMatch) pendingHeaders["User-Agent"] = uaMatch[1].replace(/^"|"$/g, "");
      const refMatch = lower.match(/http-referrer="([^"]+)"/) || line.match(/http-referrer=([^\s"]+)/i);
      if (refMatch) pendingHeaders["Referer"] = refMatch[1].replace(/^"|"$/g, "");
      const ipUa = line.match(/http-user-agent="([^"]+)"/i);
      if (ipUa) pendingHeaders["User-Agent"] = ipUa[1];
      const ipRef = line.match(/http-referrer="([^"]+)"/i);
      if (ipRef) pendingHeaders["Referer"] = ipRef[1];
      continue;
    }

    if (line.startsWith("#EXTVLCOPT:")) {
      // #EXTVLCOPT:http-user-agent=... or #EXTVLCOPT:http-referrer=... — required for many iptv-org streams
      const opt = line.slice("#EXTVLCOPT:".length).trim();
      const eq = opt.indexOf("=");
      if (eq > 0) {
        const k = opt.slice(0, eq).trim().toLowerCase();
        const v = opt.slice(eq + 1).trim();
        if (k === "http-user-agent") pendingHeaders["User-Agent"] = v;
        else if (k === "http-referrer" || k === "http-referer") pendingHeaders["Referer"] = v;
        else if (k === "http-origin") pendingHeaders["Origin"] = v;
        else pendingHeaders[k] = v;
      }
      continue;
    }

    if (line.startsWith("#")) {
      // Other directives (#EXTM3U, #EXTGRP, etc.) - ignored
      continue;
    }

    // Any non-comment, non-empty line is treated as a stream URL.
    // HLS masters contain #EXT-X-STREAM-INF + relative urls like url_0/... — those are not channels.
    // Require absolute URL (scheme or leading /) to avoid mis-parsing HLS variants as channels with 5 altUrls.
    const looksLikeUrl = line.includes("://") || line.startsWith("/") || line.startsWith("rtmp") || line.startsWith("rtsp");
    // Some playlists list backup URLs for the same channel: after one
    // #EXTINF there may be several consecutive URL lines before the next
    // #EXTINF. The first creates the entry; trailing ones are backups.
    if (!pendingName) {
      if (!looksLikeUrl) continue; // skip HLS variant relatives like url_0/...
      const last = channels[channels.length - 1];
      if (last) {
        last.altUrls = [...(last.altUrls ?? []), line];
      } else {
        // Bare URL at top of file with no EXTINF — keep it as its own entry.
        channels.push({
          id: hashId(line + line),
          name: line,
          url: line,
          group: "Uncategorized",
        });
      }
      continue;
    }
    const url = line;
    // Guard against HLS master relatives being treated as channel URLs
    if (!url.includes("://") && !url.startsWith("/") && !url.startsWith("rtmp") && !url.startsWith("rtsp")) {
      // relative variant like url_0/... from HLS master — skip, will be handled as single HLS channel in usePlaylist
      pendingName = "";
      pendingAttrs = {};
      pendingHeaders = {};
      continue;
    }
    const name = pendingName || url;
    const group = pendingAttrs["group-title"]?.trim() || "Uncategorized";

    const headers = Object.keys(pendingHeaders).length ? { ...pendingHeaders } : undefined;
    channels.push({
      id: hashId(name + url),
      name,
      url,
      logo: pendingAttrs["tvg-logo"],
      group,
      tvgId: pendingAttrs["tvg-id"],
      ...(headers ? { headers } : {}),
    });

    // Clear EXTINF state — but trailing consecutive URL lines (no EXTINF)
    // are attached to this channel via the bare-URL guard above.
    pendingName = "";
    pendingAttrs = {};
    pendingHeaders = {};
  }

  return channels;
}

/** Groups channels by their `group` field, preserving first-seen order. */
export function groupChannels(channels: Channel[]): Map<string, Channel[]> {
  const map = new Map<string, Channel[]>();
  for (const ch of channels) {
    const list = map.get(ch.group);
    if (list) {
      list.push(ch);
    } else {
      map.set(ch.group, [ch]);
    }
  }
  return map;
}
